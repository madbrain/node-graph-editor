import { NodeView, NodePropertyView, NodeFrameView, FramableView, SelectableView, getAllNodesFromSelection } from "./views";
import { Editor, Event, ControlKey, SelectorResult, VisualFeedback, SelectionMode, State, KeyMapping } from "./editor-api";
import { ColorTheme, darkTheme, GraphicalHelper, Renderer, rgb, ZoomState } from "./renderer";
import { Dimension, Point } from "./geometry";
import { NodeFactory, NodeGroup, Node, NodeProperty, PropertyType, NodeFrame, Framable, NodeGroupIO } from "./nodes";
import { ValueSelector } from "./value-selector";
import { Selector } from "./selector";
import { TreeSelector } from "./tree-selector";
import { AddNodeState, IdleState } from "./states";
import { DeleteNodesCommand, JoinInNewFrameCommand, RemoveFromFrameCommand } from "./commands";
import { Command, CommandStack, CommandStackListener } from "./command-stack";
import { buildTreeFromDefinitions } from "./tree";

export interface Options {
    container: HTMLElement;
    nodeFactory: NodeFactory;
    graphicalHelper: GraphicalHelper;
    theme?: ColorTheme;
}

function makeSpecialKeys(ev) {
    let specialKeys = 0;
    if (ev.altKey) {
        specialKeys |= ControlKey.AltKey;
    }
    if (ev.shiftKey) {
        specialKeys |= ControlKey.ShiftKey;
    }
    if (ev.ctrlKey) {
        specialKeys |= ControlKey.CtrlKey;
    }
    return specialKeys;
}

function makeEvent(ev): Event {
    const rect = ev.target.getBoundingClientRect();
    return {
        position: new Point(ev.clientX - rect.left, ev.clientY - rect.top),
        screenPosition: null,
        specialKeys: makeSpecialKeys(ev),
        deltaY: ev.deltaY,
        key: ev.key
    };
}

function parseKeymap(keyStr: string) {
    let meta = 0;
    let key = '';
    keyStr.split(" ").forEach(e => {
        if (e === 'ctrl') {
            meta |= ControlKey.CtrlKey;
        } else if (e === 'alt') {
            meta |= ControlKey.AltKey;
        } else if (e === 'shift') {
            meta |= ControlKey.ShiftKey;
        } else {
            key = e;
        }
    });
    return { meta, key };
}

type ActionCallback = () => State;

class WaitSelectorCloseState extends State {}

export class GraphEditor implements Editor, CommandStackListener {

    private parentElement : HTMLElement;
    private eventElement: HTMLElement;
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private selectors = new Map<string, Selector>();

    private debug = false;
    private nodeFactory: NodeFactory;
    private commandStack = new CommandStack();
    private zoomState = new ZoomState();
    private state: State = new IdleState();
    private mousePosition = new Point(0, 0);
    private feedbacks: VisualFeedback[] = [];
    private actions = new Map<string, ActionCallback>();
    selection: SelectableView[] = [];
    nodeGroup: NodeGroup = { nodes: [], frames: [] };
    nodeViews: NodeView[] = [];
    frameViews: NodeFrameView[] = [];
    renderer: Renderer;
    keymap: KeyMapping[] = [];

    private listeners: ((nodeGroup: NodeGroup) => void)[] = [];
    
    constructor (options: Options) {
        
        this.createDomElements(options);
        this.registerSelector("select-value", new ValueSelector());
        this.registerSelector("select-tree", new TreeSelector());

        const theme = options.theme || darkTheme;

        const rect = this.parentElement.getBoundingClientRect();

        this.nodeFactory = options.nodeFactory;
        this.context = this.canvas.getContext('2d', {alpha: false});
        this.renderer = new Renderer(this.context, new Dimension(rect.width, rect.height), theme, options.graphicalHelper);
        this.commandStack.addListener(this);
        this.registerActions();
        this.registerKeymaps();

        setTimeout(() => {
            this.handleResize();
        }, 10);
    }

    public onStackChange(isVisual: boolean) {
        this.listeners.forEach(listener => {
            listener(this.nodeGroup);
        })
    }

    public onGraphChange(callback: (nodeGroup: NodeGroup) => void) {
        this.listeners.push(callback);
    }

    public registerSelector(name: string, selector: Selector) {
        this.selectors.set(name, selector);
        this.parentElement.appendChild(selector.el());
    }

    public updatePreviews(previews: { [id: string]: ImageData }) {
        this.nodeViews.forEach(nodeView => {
            if (nodeView.node.definition.preview && previews[nodeView.node.id]) {
                nodeView.updatePreview(previews[nodeView.node.id]);
            }
        });
        this.draw();
    }

    private registerActions() {
        this.registerAction("undo", () => {
            this.commandStack.undo();
            this.draw();
            return this.state;
        });
        this.registerAction("redo", () => {
            this.commandStack.redo();
            this.draw();
            return this.state;
        });
        this.registerAction("select-all", () => {
            this.select(this.nodeViews, SelectionMode.REPLACE);
            this.draw();
            return this.state;
        });
        this.registerAction("create-node", () => {
            const selector = this.openSelectorOnScreen(this.mousePosition, 'select-tree', {
                nodes: buildTreeFromDefinitions(this.nodeFactory.getNodeDefinitions()),
            });
            selector.result.then(nodeDef => {
                const node = this.nodeFactory.createNode(nodeDef.name, this.mousePosition);
                const nodeView = new NodeView(node);
                nodeView.layoutNode(this.renderer);
        
                this.select([], SelectionMode.REPLACE);
                this.state = new AddNodeState(this, nodeView);
            }, () => {});
            return selector.state;
        });
        this.registerAction("toggle-debug", () => {
            this.debug = ! this.debug;
            this.draw();
            return this.state;
        });
        this.registerAction("delete-node", () => {
            if (this.selection.length > 0) {
                // TODO how to differentiate selectables ?
                const frames = this.selection
                    .filter(n => (<any>n).frame)
                    .map(n => (<NodeFrameView>n).frame);
                const nodes = getAllNodesFromSelection(this.selection)
                    .map(nv => nv.node);
                this.selection = [];
                this.emit(new DeleteNodesCommand(this.nodeGroup, nodes.concat(), frames));
            }
            return this.state;
        });
        this.registerAction("join-in-new-frame", () => {
            if (this.selection.length > 0) {
                // TODO how to differentiate selectables ? => should get all framables
                const nodes = getAllNodesFromSelection(this.selection)
                    .map(nv => nv.node);
                this.select([], SelectionMode.REPLACE);
                this.emit(new JoinInNewFrameCommand(this.nodeGroup, nodes));
            }
            return this.state;
        });
        this.registerAction("add-to-frame", () => {
            if (this.selection.length > 0) {
                // TODO how to differentiate selectables ?
                // TODO should also be possible by drag-drop
                // selection can contains multiple frame, which one is the target ?
                console.log("ADD TO FRAME", this.selection);
            }
            return this.state;
        });
        this.registerAction("remove-from-frame", () => {
            // TODO how to differentiate selectables ? => should get all framables
            const nodes = getAllNodesFromSelection(this.selection)
                .filter(n => n.parent != null)
                .map(n => n.node);
            if (nodes.length > 0) {
                this.select([], SelectionMode.REPLACE);
                this.emit(new RemoveFromFrameCommand(nodes));
            }
            return this.state;
        });
    }

    private registerAction(name: string, func: ActionCallback) {
        this.actions.set(name, func);
    }

    public doAction(name: string): State {
        const action = this.actions.get(name);
        if (action) {
            return action();
        }
        console.log("Unknown action", name);
        return this.state;
    }

    private registerKeymaps() {
        this.registerKeymap("ctrl z", "undo");
        this.registerKeymap("ctrl y", "redo");
        this.registerKeymap("shift B", "select-all");
        this.registerKeymap("shift A", "create-node");
        this.registerKeymap("shift H", "toggle-debug");
        this.registerKeymap("Delete", "delete-node");
        this.registerKeymap("shift J", "join-in-new-frame");
        this.registerKeymap("shift P", "add-to-frame");
        this.registerKeymap("alt p", "remove-from-frame");
    }

    public registerKeymap(key: string, action: string) {
        const keymap = parseKeymap(key);
        this.keymap.push({ ...keymap, action })
    }

    private createDomElements(options: Options) {
        this.parentElement = document.createElement("div");
        this.parentElement.setAttribute("class", "graph-editor-container");
        options.container.appendChild(this.parentElement);

        this.eventElement = document.createElement("div");
        this.eventElement.addEventListener("mousedown", e => this.handleMouseDown(e));
        this.eventElement.addEventListener("mouseup", e => this.handleMouseUp(e));
        this.eventElement.addEventListener("mousemove", e => this.handleMouseMove(e));
        this.eventElement.addEventListener("wheel", e => this.handleMouseWheel(e));
        this.parentElement.appendChild(this.eventElement);

        this.canvas = document.createElement("canvas");
        this.eventElement.appendChild(this.canvas);
        
        window.addEventListener("resize", e => this.handleResize());
        window.addEventListener("keyup", e => this.handleKeyUp(e));
    }

    private handleResize() {
        const rect = this.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        setTimeout(() => {
            this.renderer.setSize(new Dimension(rect.width, rect.height));
            this.draw();
        }, 10);
    }

    private handleMouseDown(ev) {
        const event = makeEvent(ev);
        this.state = this.state.handleMouseDown(this, this.scalePosition(event));
        this.debugState("MOUSE DOWN");
    }

    private handleMouseUp(ev) {
        const event = makeEvent(ev);
        this.state = this.state.handleMouseUp(this, this.scalePosition(event));
        this.debugState("MOUSE UP");
    }

    private handleMouseMove(ev) {
        const event = makeEvent(ev);
        this.mousePosition = event.position;
        this.state = this.state.handleMouseMove(this, this.scalePosition(event));
        this.debugState("MOUSE MOVE");
    }

    private handleMouseWheel(ev) {
        const event = makeEvent(ev);
        this.state = this.state.handleMouseWheel(this, this.scalePosition(event));
        this.debugState("MOUSE WHEEL");
    }

    private handleKeyUp(ev) {
        const event = makeEvent(ev);
        this.state = this.state.handleKeyUp(this, event);
        this.debugState("KEY");
    }

    private syncView() {
        const nodeMap = new Map<Node, NodeView>();
        const frameMap = new Map<NodeFrame, NodeFrameView>();
        this.nodeViews.forEach(nv => {
            nodeMap.set(nv.node, nv);
            nv.parent = null;
        });
        this.frameViews.forEach(fv => {
            frameMap.set(fv.frame, fv);
            fv.parent = null;
        });
        this.nodeViews = this.nodeGroup.nodes.map(node => {
            const existingView = nodeMap.get(node);
            if (existingView) {
                existingView.refreshProperties();
                return existingView;
            }
            return new NodeView(node);
        });
        this.frameViews = this.nodeGroup.frames.map(frame => {
            const existingView = frameMap.get(frame);
            if (existingView) {
                return existingView;
            }
            return new NodeFrameView(frame);
        });
        const propertyMap = new Map<NodeProperty, NodePropertyView>();
        this.nodeViews.forEach(node => {
            node.propertyViews.forEach(property => propertyMap.set(property.property, property))
        });
        const framableMap = new Map<Framable, FramableView>();
        this.nodeViews.forEach(nv => {
            framableMap.set(nv.node, nv);
        });
        this.frameViews.forEach(fv => {
            framableMap.set(fv.frame, fv);
        });
        this.nodeViews.forEach(node => node.updateConnections(propertyMap));
        this.frameViews.forEach(fv => fv.updateChildren(framableMap));
    }

    draw() {
        this.renderer.context.save();
        this.renderer.clearScreen(this.renderer.theme.BACKGROUND_COLOR);
    
        this.renderer.setProjection(this.zoomState);
     
        this.renderer.drawGrid(this.zoomState, this.renderer.theme.BORDER_COLOR, this.renderer.style.snapSize, 5, 2);
        
        this.syncView();

        this.nodeViews.forEach(nodeView => nodeView.layoutNode(this.renderer));

        this.frameViews
            .filter(frameView => !frameView.parent)
            .forEach(frameView => frameView.draw(this))
    
        // draw connections
        this.nodeViews.forEach(node => {
            node.propertyViews
                .filter(prop => prop.property.definition.type == PropertyType.OUTPUT)
                .forEach(prop => {
                    prop.connections.forEach(connection => {
                        const fromPos = connection.from.globalPosition();
                        const toPos = connection.to.globalPosition();
                        const selected = this.isSelected(connection.from.node) || this.isSelected(connection.to.node);
                        this.renderer.drawConnection(fromPos, toPos, selected
                            ? this.renderer.theme.SELECTION_COLOR : this.renderer.theme.NODE_BACK_COLOR);
                    });
                });
        });

        this.feedbacks
            .filter(feedback => !feedback.foreground)
            .forEach(feedback => feedback.draw(this));
    
        this.nodeViews.forEach(node => node.draw(this));

        this.feedbacks
            .filter(feedback => feedback.foreground)
            .forEach(feedback => feedback.draw(this));

        this.renderer.context.restore();
    }

    addFeedback(feedback: VisualFeedback) {
        this.feedbacks.push(feedback);
    }

    removeFeedback(feedback: VisualFeedback) {
        this.feedbacks.splice(this.feedbacks.indexOf(feedback), 1);
    }

    setNodeGroup(nodeGroup: NodeGroup) {
        this.nodeGroup = nodeGroup;
        this.reset();
        this.draw();
    }

    private reset() {
        this.selection = [];
        this.feedbacks = [];
        this.commandStack.clear();
        this.zoomState.reset();
    }

    emit(command: Command) {
        this.commandStack.emit(command);
        this.draw();
    }

    load(nodeGroupIO: NodeGroupIO) {
        this.reset();
        const nodeGroup = this.nodeFactory.load(nodeGroupIO);
        this.nodeGroup = nodeGroup;
        if (nodeGroup.zoomState) {
            this.zoomState.update(nodeGroup.zoomState.origin, nodeGroup.zoomState.scale);
        }
        this.nodeGroup.zoomState = this.zoomState;
        this.draw();
        this.onStackChange(false);
    }

    save(): NodeGroupIO {
        this.nodeGroup.zoomState = this.zoomState;
        return this.nodeFactory.save(this.nodeGroup);
    }

    updateZoom(offset: Point, zoomFactor: number) {
        this.zoomState.update(this.zoomState.origin.sub(offset), this.zoomState.scale / zoomFactor);
        this.draw();
    }

    updatePosition(offset: Point) {
        this.zoomState.move(offset);
        this.draw();
    }

    isSelected(node: NodeView) {
        return this.selection.indexOf(node) >= 0;
    }

    select(nodes: NodeView[], mode: SelectionMode) {
        this.selection.forEach(node => node.isSelected = false);
        if (mode == SelectionMode.ADD) {
            nodes.forEach(node => {
                if (this.selection.indexOf(node) < 0) {
                    this.selection.push(node);
                }
            });
        } else if (mode == SelectionMode.REMOVE) {
            nodes.forEach(node => {
                const pos = this.selection.indexOf(node);
                if (pos >= 0) {
                    this.selection.splice(pos, 1);
                }
            });
        } else {
            this.selection = nodes;
        }
        this.selection.forEach(node => node.isSelected = true);
    }

    canConnect(fromProperty: NodeProperty, toProperty: NodeProperty) {
        if (fromProperty.node == toProperty.node
                || fromProperty.definition.type == toProperty.definition.type) {
            return false;
        }
        if (fromProperty.definition.type == PropertyType.INPUT && fromProperty.isConnected()
                || toProperty.definition.type == PropertyType.INPUT && toProperty.isConnected()) {
            return false;
        }
        // TODO call helper to restrict even further possible connection
        return true;
    }

    openSelector(position: Point, type: string, context: any): SelectorResult {
        const screenPosition = this.getScreenPosition(position);
        return this.openSelectorOnScreen(screenPosition, type, context);
    }

    private openSelectorOnScreen(screenPosition: Point, type: string, context: any) {
        const selector = this.selectors.get(type);
        const result = selector ? selector.open(screenPosition, context) : null;
        if (result) {
            return {
                state: new WaitSelectorCloseState(),
                result: result.finally(() => {
                    this.state = new IdleState();
                })
            }
        }
        console.log("Unknown selector", type, context);
        return {
            state: new IdleState(),
            result: Promise.reject()
        }
    }

    private scalePosition(event: Event): Event {
        event.screenPosition = event.position;
        event.position = this.renderer.getPosition(this.zoomState, event.position);
        return event;
    }

    getScreenPosition(position: Point): Point {
        return new Point((position.x - this.zoomState.origin.x) * this.zoomState.scale,
            (position.y - this.zoomState.origin.y) * this.zoomState.scale);
    }

    private debugState(msg: string) {
        if (this.debug) {
            let position = new Point(10, this.renderer.size.height - 20);
            this.renderer.roundBox()
                .filled(rgb(this.renderer.theme.PROPERTY_COLOR))
                .draw(position.offset(0, -this.renderer.style.unit * 3).rect(400, this.renderer.style.unit * 4));
            this.renderer.drawText(position.offset(10, 0), rgb(this.renderer.theme.TEXT_COLOR), msg + " - " + this.state.constructor.name);
    
            const count = 5;
            position = new Point(this.renderer.size.width - 10, this.renderer.size.height - 20);
            this.renderer.roundBox()
                .filled(rgb(this.renderer.theme.PROPERTY_COLOR))
                .draw(position.offset(-400, -this.renderer.style.unit * (4*count - 1)).rect(400, this.renderer.style.unit * 4*count));
            for (let i = 0; i < Math.min(count, this.commandStack.commands.length); ++i) {
                const command = this.commandStack.commands[this.commandStack.commands.length - 1 - i];
                const isTop = this.commandStack.undoIndex == (this.commandStack.commands.length - 1 - i);
                this.renderer.drawText(position.offset(-400+10, this.renderer.style.unit * 4*(i - count + 1)),
                    rgb(this.renderer.theme.TEXT_COLOR),
                    (isTop ? "*" : " ") + command.constructor.name);
            }
        }
    }

}
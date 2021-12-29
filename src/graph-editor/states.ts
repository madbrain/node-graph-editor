import { NodeView, NodePropertyView, ConnectionView, SelectableView, FramableView, NodeFrameView, getAllNodesFromSelection } from "./views";
import { Editor, Event, ControlKey, VisualFeedback, SelectionMode, State, KeyMapping } from "./editor-api";
import { Point, Rectangle } from "./geometry";
import { StyleDimension } from "./renderer";
import { MoveNodeCommand as MoveNodesCommand, ToggleCollapseCommand, CreateConnectionCommand, RemoveConnectionCommand,
    CompositeCommand, AddNodeCommand, ResizeNodeCommand, DeleteNodesCommand, RenameFrameCommand } from "./commands";
import { CommonValueType } from "./value";

function findConnector(nodes: NodeView[], position: Point, style: StyleDimension): NodePropertyView {
    for (let node of nodes) {
        const connector = node.findConnector(position, style);
        if (connector != null) {
            return connector; 
        }
    }
    return null;
}

function toSelectionMode(keys: number) {
    if ((keys & ControlKey.ShiftKey) != 0) {
        return SelectionMode.ADD;
    } else if ((keys & ControlKey.CtrlKey) != 0) {
        return SelectionMode.REMOVE;
    } else {
        return SelectionMode.REPLACE;
    }
}

function snap(point: Point, event: Event, snapSize: number) {
    if ((event.specialKeys & ControlKey.ShiftKey) != 0) {
        return new Point(Math.ceil(point.x / snapSize) * snapSize, Math.ceil(point.y / snapSize) * snapSize); 
    }
    return point;
}

function translateKeymap(keymaps: KeyMapping[], event: Event): string {
    for (let keymap of keymaps) {
        if (event.key === keymap.key && (event.specialKeys & keymap.meta) === keymap.meta) {
            return keymap.action;
        }
    }
    return null;
}

export class IdleState extends State {
    handleMouseDown(editor: Editor, event: Event): State {
        if (event.specialKeys & ControlKey.AltKey) {
            return new DragPanningState(event.position);
        }
        for (let node of editor.nodeViews.slice().reverse()) {
            // TODO compute a special node bounds containing connectors to speed up detection
            const connector = node.findConnector(event.position, editor.renderer.style);
            if (connector != null) {
                editor.select([node], SelectionMode.REPLACE);
                return new DragConnectionState(editor, connector, event.position);
            } else if (node.bounds.contains(event.position)) {
                const collapseArrowSize = editor.renderer.style.collapseArrowSize;
                const arrowBounds = node.collapseArrowCenter.rectCentered(collapseArrowSize, collapseArrowSize);
                if (arrowBounds.contains(event.position)) {
                    return new ToggleCollapseState(node);
                } else if (node.labelBounds.contains(event.position)) {
                    if (!node.isSelected) {
                        editor.select([node], toSelectionMode(event.specialKeys));
                        editor.draw();
                    }
                    return new StartDragNodesState(event.position, node);
                } else {
                    const properties = node.propertyViews.filter(property => property.bounds.move(node.bounds.origin).contains(event.position));
                    if (properties.length > 0) {
                        const property = properties[0];
                        const handler = editor.renderer.graphicalHelper.getPropertyHandler(property.property);
                        if (handler) {
                            return handler.handlerMouseDown(editor, event, property);
                        }
                        return this;
                    }
                    const radius = editor.renderer.style.roundRadius;
                    if (node.bounds.corner().offset(-radius, -radius).distance(event.position) < radius) {
                        return new DragResizeNodeState(editor, node, event.position);
                    }
                    return this;
                }
            }
        }
        for (let frame of editor.frameViews.slice().reverse()) {
            if (frame.bounds.contains(event.position)) {
                if (!frame.isSelected) {
                    editor.select([frame], toSelectionMode(event.specialKeys));
                    editor.draw();
                }
                if (frame.labelBounds.contains(event.position)) {
                    return new StartDragFrameState(event.position, frame);
                } else {
                    return new StartDragNodesState(event.position, frame);
                }
            }
        }
        return new DragSelectionBoxState(editor, event.position);
    }

    handleMouseWheel(editor: Editor, event: Event): State {
        // TODO adjust zoom panning
        // https://stackoverflow.com/questions/2916081/zoom-in-on-a-point-using-scale-and-translate
        const zoomIntensity = 0.9;
        const zoomFactor = event.deltaY > 0 ? 1 / zoomIntensity : zoomIntensity;
        const offset = event.position.scale(zoomFactor - 1);
        editor.updateZoom(offset, zoomFactor);
        return this;
    }

    handleKeyUp(editor: Editor, event: Event) {
        const action = translateKeymap(editor.keymap, event);
        if (action) {       
            return editor.doAction(action);
        }
        return this;
    }
}

class PendingConnectionFeedback implements VisualFeedback {

    toProperty: NodePropertyView = null;
    
    constructor(private fromProperty: NodePropertyView, private toPoint: Point) {}

    update(toProperty: NodePropertyView, position: Point) {
        this.toProperty = toProperty;
        this.toPoint = position;
    }

    draw(editor: Editor) {
        let toPos = this.toPoint;
        let color = editor.renderer.theme.NODE_BACK_COLOR;
        if (this.toProperty != null && editor.canConnect(this.fromProperty.property, this.toProperty.property)) {
            toPos = this.toProperty.globalPosition();
            color = editor.renderer.theme.SELECTION_COLOR;
        }
        const fromPos = this.fromProperty.globalPosition();
        editor.renderer.drawConnection(fromPos, toPos, color);
    }
}

class DragConnectionState extends State {
    feedback: PendingConnectionFeedback;
    previousConnection: ConnectionView = null;

    constructor (editor: Editor, private fromProperty: NodePropertyView, startPoint: Point) {
        super();
        if (fromProperty.isConnected()) {
            this.previousConnection = fromProperty.connections[0];
            this.previousConnection.connection.disconnect();
            this.fromProperty = this.previousConnection.opposite(fromProperty);
        }
        this.feedback = new PendingConnectionFeedback(this.fromProperty, startPoint)
        editor.addFeedback(this.feedback);
        editor.draw();
    }

    handleMouseMove(editor: Editor, event: Event): State {
        const toProperty = findConnector(editor.nodeViews, event.position, editor.renderer.style);
        this.feedback.update(toProperty, event.position);
        editor.draw();
        return this;
    }

    handleMouseUp(editor: Editor, event: Event): State {
        editor.removeFeedback(this.feedback);
        const toProperty = findConnector(editor.nodeViews, event.position, editor.renderer.style);
        const createCommand = toProperty != null && editor.canConnect(this.fromProperty.property, toProperty.property)
                ? new CreateConnectionCommand(this.fromProperty.property, toProperty.property) : null;
        if (this.previousConnection == null) {
            if (createCommand != null) {
                editor.emit(createCommand);
            } else {
                editor.draw();
            }
        } else {
            const disconnectCommand = new RemoveConnectionCommand(this.previousConnection.connection);
            if (createCommand == null) {
                editor.emit(disconnectCommand);
            } else if (toProperty.property.isRelatedTo(this.previousConnection.connection.opposite(this.fromProperty.property))) {
                // no action actually
                this.previousConnection.connection.connect();
                editor.draw();
            } else {
                editor.emit(new CompositeCommand([ disconnectCommand, createCommand ]));
            }
        }
        return new IdleState();
    }

    handleMouseDown(editor: Editor, event: Event): State {
        // should not happen, in case return to Idle
        return new IdleState();
    }

}

class SelectionBoxFeedback implements VisualFeedback {
    foreground = true;
    toPosition: Point;
    bounds: Rectangle;
    
    constructor(private fromPosition: Point) {
        this.update(fromPosition);
    }

    draw(editor: Editor) {
        editor.renderer.drawSelection(this.bounds);
    }

    update(position: Point) {
        this.toPosition = position;
        this.bounds = this.fromPosition.rectTo(this.toPosition);
    }
}

class DragSelectionBoxState extends State {

    feedback: SelectionBoxFeedback;
    originalSelection: SelectableView[];

    constructor (editor: Editor, startPoint: Point) {
        super();
        this.originalSelection = editor.selection.slice();
        this.feedback = new SelectionBoxFeedback(startPoint)
        editor.addFeedback(this.feedback);
        editor.draw();
    }

    private updateSelection(editor: Editor, event: Event) {
        let selectedNodes: SelectableView[] = editor.nodeViews.filter(node => {
            return this.feedback.bounds.containsRect(node.bounds);
        });
        const mode = toSelectionMode(event.specialKeys);
        if (mode == SelectionMode.ADD) {
            this.originalSelection.forEach(node => {
                if (selectedNodes.indexOf(node) < 0) {
                    selectedNodes.push(node);
                }
            });
        } else if (mode == SelectionMode.REMOVE) {
            selectedNodes = this.originalSelection.filter(node => selectedNodes.indexOf(node) < 0);         
        }
        editor.select(selectedNodes, SelectionMode.REPLACE);
    }

    handleMouseMove(editor: Editor, event: Event): State {
        this.feedback.update(event.position);
        this.updateSelection(editor, event);
        editor.draw();
        return this;
    }

    handleMouseUp(editor: Editor, event: Event): State {
        this.updateSelection(editor, event);
        editor.removeFeedback(this.feedback);
        editor.draw();
        return new IdleState();
    }

    handleMouseDown(editor: Editor, event: Event): State {
        // should not happen, in case return to Idle
        return new IdleState();
    }
}

class ResizeNodeFeedback implements VisualFeedback {
    foreground = true;
    bounds: Rectangle;
    
    constructor(private fromPosition: Point, private toPosition: Point) {
        this.update(fromPosition);
    }

    draw(editor: Editor) {
        editor.renderer.drawSelection(this.bounds);
    }

    update(position: Point) {
        this.toPosition = position;
        this.bounds = this.fromPosition.rectTo(this.toPosition);
    }
}

class DragResizeNodeState extends State {

    feedback: ResizeNodeFeedback;

    constructor (editor: Editor, private node: NodeView, startPoint: Point) {
        super();
        this.feedback = new ResizeNodeFeedback(node.bounds.origin, startPoint)
        editor.addFeedback(this.feedback);
        editor.draw();
    }

    handleMouseMove(editor: Editor, event: Event): State {
        this.feedback.update(event.position);
        editor.draw();
        return this;
    }

    handleMouseUp(editor: Editor, event: Event): State {
        editor.emit(new ResizeNodeCommand(this.node.node, this.feedback.bounds.dimension));
        editor.removeFeedback(this.feedback);
        editor.draw();
        return new IdleState();
    }

    handleMouseDown(editor: Editor, event: Event): State {
        // should not happen, in case return to Idle
        return new IdleState();
    }
}

class StartDragNodesState extends State {
    constructor(private startPosition: Point, private node: SelectableView) {
        super();
    }

    handleMouseMove(editor: Editor, event: Event): State {
        const MINIMAL_MOVE = 3;
        if (event.position.distance(this.startPosition) > MINIMAL_MOVE) {
            return new DragNodesState(editor.selection, this.startPosition).handleMouseMove(editor, event);
        }
        return this;
    }

    handleMouseUp(editor: Editor, event: Event): State {
        editor.select([this.node], toSelectionMode(event.specialKeys));
        editor.draw();
        return new IdleState();
    }

    handleMouseDown(editor: Editor, event: Event): State {
        // should not happen, in case return to Idle
        return new IdleState();
    }
}

class StartDragFrameState extends State {
    constructor(private startPosition: Point, private frame: NodeFrameView) {
        super();
    }

    handleMouseMove(editor: Editor, event: Event): State {
        const MINIMAL_MOVE = 3;
        if (event.position.distance(this.startPosition) > MINIMAL_MOVE) {
            return new DragNodesState(editor.selection, this.startPosition).handleMouseMove(editor, event);
        }
        return this;
    }

    handleMouseUp(editor: Editor, event: Event): State {
        const selectorResult = editor.openSelector(this.frame.labelBounds.middleBottom().offset(-100, 0), "select-value", {
            value: this.frame.frame.label,
            valueType: { type: CommonValueType.STRING }
        });
        selectorResult.result.then(newName => {
            editor.emit(new RenameFrameCommand(this.frame.frame, newName));
            editor.select([this.frame], toSelectionMode(event.specialKeys));
            editor.draw();
            return new IdleState();
        }, () => {});
        return selectorResult.state;
        
    }

    handleMouseDown(editor: Editor, event: Event): State {
        // should not happen, in case return to Idle
        return new IdleState();
    }
}

class DragNodesState extends State {

    private originalPositions = new Map<NodeView, Point>()

    constructor(selection: SelectableView[], private startPosition: Point) {
        super();
        getAllNodesFromSelection(selection).forEach(node => {
            this.originalPositions.set(node, node.bounds.origin);
        });
    }

    handleMouseMove(editor: Editor, event: Event): State {
        for (let [node, startPosition] of this.originalPositions.entries()) {
            const point = startPosition.add(event.position.sub(this.startPosition));
            node.moveTo(snap(point, event, editor.renderer.style.snapSize));
        }
        editor.draw();
        return this;
    }

    handleMouseUp(editor: Editor, event: Event): State {
        const moves = [];
        for (let [node, startPosition] of this.originalPositions.entries()) {
            const point = startPosition.add(event.position.sub(this.startPosition));
            const endPosition = snap(point, event, editor.renderer.style.snapSize);
            moves.push({ node: node.node, startPosition, endPosition });
        }
        if (moves.length > 0) {
            editor.emit(new MoveNodesCommand(moves));
        }
        return new IdleState();
    }

    handleMouseDown(editor: Editor, event: Event): State {
        // should not happen, in case return to Idle
        return new IdleState();
    }

}

class ToggleCollapseState extends State {
    constructor(private node: NodeView) {
        super();
    }

    handleMouseMove(editor: Editor, event: Event): State {
        return this;
    }

    handleMouseUp(editor: Editor, event: Event): State {
        editor.emit(new ToggleCollapseCommand(this.node.node));
        return new IdleState();
    }

    handleMouseDown(editor: Editor, event: Event): State {
        // should not happen, in case return to Idle
        return new IdleState();
    }

}

class DragPanningState extends State {

    constructor(private startPoint: Point) {
        super();
    }

    handleMouseMove(editor: Editor, event: Event): State {
        editor.updatePosition(this.startPoint.sub(event.position));
        editor.draw();
        return this;
    }

    handleMouseUp(editor: Editor, event: Event): State {
        return new IdleState();
    }

    handleMouseDown(editor: Editor, event: Event): State {
        // should not happen, in case return to Idle
        return new IdleState();
    }

}

class AddNodeFeedback implements VisualFeedback {
    foreground = true;

    constructor(private node: NodeView) {}

    draw(editor: Editor) {
        this.node.draw(editor);
    }

}

export class AddNodeState extends State {
    private feedback: AddNodeFeedback;

    constructor(editor: Editor, private node: NodeView) {
        super();
        this.feedback = new AddNodeFeedback(node);
        editor.addFeedback(this.feedback);
        editor.draw();
    }

    handleMouseMove(editor: Editor, event: Event): State {
        this.node.moveTo(snap(event.position, event, editor.renderer.style.snapSize));
        this.node.layoutNode(editor.renderer);
        editor.draw();
        return this;
    }

    handleMouseUp(editor: Editor, event: Event): State {
        editor.removeFeedback(this.feedback);
        editor.emit(new AddNodeCommand(editor.nodeGroup, this.node.node));
        editor.select([ editor.nodeViews.find(nv => nv.node === this.node.node) ], SelectionMode.REPLACE);
        editor.draw();
        return new IdleState();
    }

    handleKeyUp(editor: Editor, event: Event): State {
        if (event.key === 'Escape') {
            editor.removeFeedback(this.feedback);
            editor.draw();
            return new IdleState();
        }
        return this;
    }

}
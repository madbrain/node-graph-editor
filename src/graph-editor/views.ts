import { Rectangle, Point } from "./geometry";
import { Renderer, rgb, Corner, Direction, StyleDimension, Align } from "./renderer";
import { defaultPropertyHandler } from "./handlers";
import { Node, PropertyType, NodeProperty, NodeConnection, NodeFrame, Framable, isOutput, isNewPort } from './nodes';
import { Editor } from "./editor-api";

export class ConnectionView {
    
    constructor(public connection: NodeConnection, public from: NodePropertyView, public to: NodePropertyView) {}

    opposite(property: NodePropertyView): NodePropertyView {
        if (property === this.from) {
            return this.to;
        }
        return this.from;
    }
}

export class NodePropertyView {
    bounds: Rectangle; // relative to parent node position
    connector: Point;  // relative to parent node position
    connections: ConnectionView[] = [];

    constructor(public property: NodeProperty, public node: NodeView) {}

    isConnected() {
        return this.property.isConnected();
    }
    
    isEditable() {
        return this.property.isEditable();
    }

    globalBounds() {
        return this.bounds.move(this.node.bounds.origin);
    }

    globalPosition(): Point {
        return this.connector.add(this.node.bounds.origin);
    }

    getValue() {
        return this.property.getValue();
    }

    connectTo(connection: NodeConnection) {
        this.property.connectTo(connection);
    }

    disconnectFrom(connection: NodeConnection) {
        this.property.disconnectFrom(connection);
    }

    updateConnections(propertyMap: Map<NodeProperty, NodePropertyView>): void {
        this.connections = this.property.connections.map(connection => {
            const from = propertyMap.get(connection.from);
            const to = propertyMap.get(connection.to);
            return new ConnectionView(connection, from, to)
        });
    }

    setBounds(bounds: Rectangle) {
        this.bounds = bounds;
        this.connector = this.property.definition.type == PropertyType.INPUT
            || this.property.definition.type == PropertyType.NEW_INPUT ? bounds.middleLeft() : bounds.middleRight();
    }

    drawProperty(renderer: Renderer, origin: Point) {
        if (this.property.isEditable()) {
            const handler = renderer.graphicalHelper.getPropertyHandler(this.property);
            if (handler) {
                handler.draw(renderer, this);
            } else {
                // default just in case but should not be used as property is editable
                console.log("no handler for drawing", this);
                defaultPropertyHandler.draw(renderer, this);
            }
        } else {
            // not editable: just the label
            defaultPropertyHandler.draw(renderer, this);
        }
        this.drawConnector(renderer, origin);
    }

    drawConnector(renderer: Renderer, origin: Point) {
        if (this.property.definition.linkable) {
            renderer.drawConnector(this.connector.add(origin),
                rgb(renderer.graphicalHelper.getConnectorColor(this.property)),
                isNewPort(this.property.definition.type));
        }
    }
    
}

export interface SelectableView {
    bounds: Rectangle;
    isSelected: boolean;
}

export function getAllNodesFromSelection(selection: SelectableView[]): NodeView[] {
    const result: NodeView[] = [];
    selection.forEach(sv => {
        // TODO should have a better discriminator
        if ((<any>sv).node) {
            result.push(<NodeView>sv);
        } else {
            result.push(...(<NodeFrameView>sv).getAllNodes());
        }
    });
    return result;
}

export interface FramableView extends SelectableView {
    parent?: NodeFrameView;
}

export class NodeView implements FramableView, SelectableView {
    
    bounds: Rectangle;
    labelBounds: Rectangle;
    collapseArrowCenter: Point;
    fullWidth = 200;
    isSelected = false;
    parent: NodeFrameView = null;
    propertyViews: NodePropertyView[];
    private previewOffset = 0;
    private previewImage: ImageData;
    private resizeCanvas: HTMLCanvasElement;

    constructor(public node: Node) {
        this.bounds = node.location.rect(0, 0);
        this.refreshProperties();
    }

    refreshProperties() {
        this.propertyViews = [];
        this.node.properties.forEach(property => {
            property.subProperties.forEach(subProperty => this.propertyViews.push(new NodePropertyView(subProperty, this)));
            this.propertyViews.push(new NodePropertyView(property, this));
        });
    }

    moveTo(position: Point) {
        this.node.location = position;
        this.updateBounds();
    }

    private updateBounds() {
        this.bounds = this.node.location.rectOf(this.bounds.dimension);
    }

    findConnector(position: Point, style: StyleDimension): NodePropertyView {
        const connectors = this.propertyViews.filter(prop => {
            if (prop.property.definition.linkable) {
                const center = prop.connector.add(this.bounds.origin);
                return center.distance(position) <= style.connectorRadius;
            }
        });
        return connectors.length > 0 ? connectors[0] : null;
    }

    updateConnections(propertyMap: Map<NodeProperty, NodePropertyView>): void {
        this.propertyViews.forEach(prop => prop.updateConnections(propertyMap));
    }

    private layoutNodeFull(renderer: Renderer) {
        this.propertyViews.forEach(prop => {
            const handler = renderer.graphicalHelper.getPropertyHandler(prop.property);
            if (handler) {
                handler.layout(renderer, prop);
            } else {
                console.log("No handler to layout property", prop);
            }
        });
        let width = this.node.fullWidth;
        this.propertyViews.forEach(prop => {
            width = Math.max(width, prop.bounds.dimension.width);
        });
        
        const MINIMAL_NODE_WIDTH = 200;
        width = Math.max(MINIMAL_NODE_WIDTH, width);

        let y = renderer.style.headerHeight;
        function layoutProperty(prop: NodePropertyView, i: number) {
            if (i > 0) {
                y += renderer.style.unit / 2;
            }
            const propHeight = prop.bounds.dimension.height;
            prop.setBounds(new Point(0, y).rect(width, propHeight));
            y += propHeight;
        }
        this.propertyViews
            .filter(prop => isOutput(prop.property.definition.type))
            .forEach((prop, i) => layoutProperty(prop, i));

        if (this.node.definition.preview) {
            this.previewOffset = y;
            y += width * this.getPreviewRatio();
        }
        this.propertyViews
            .filter(prop => !isOutput(prop.property.definition.type))
            .forEach((prop, i) => layoutProperty(prop, i));

        this.bounds = this.bounds.origin.rect(width, y + renderer.style.unit);
        this.labelBounds = this.bounds.withHeight(renderer.style.headerHeight);
        this.collapseArrowCenter = this.bounds.origin.offset(renderer.style.unit * 2, renderer.style.unit * 2.5);
    }

    private getPreviewRatio() {
        if (this.previewImage) {
            return this.previewImage.height / this.previewImage.width;
        }
        return 2.0 / 3.0;
    }

    private drawPreview(renderer: Renderer, origin: Point) {
        const style = renderer.style;
        const width = this.bounds.dimension.width;
        const previewRect = origin.rect(width, width * this.getPreviewRatio()).shrink(style.unit, style.unit);
        if (this.previewImage) {
            const canvas = this.getResizeCanvas();
            canvas.width = this.previewImage.width;
            canvas.height = this.previewImage.height;
            const ctx = canvas.getContext("2d");
            ctx.putImageData(this.previewImage, 0, 0);
            renderer.drawImage(canvas, previewRect);
        } else {
            renderer.roundBox()
                .filled(rgb(renderer.theme.PROPERTY_COLOR))
                .draw(previewRect);
        }
    }

    private getResizeCanvas() {
        if (!this.resizeCanvas) {
            this.resizeCanvas = document.createElement("canvas");
        }
        return this.resizeCanvas;
    }

    updatePreview(imageData: ImageData) {
        this.previewImage = imageData;
    }
    
    private layoutNodeCollapsed(renderer: Renderer) {
        let numIn = 0;
        let numOut = 0;
        this.node.properties.filter(prop => prop.definition.linkable).forEach((prop, i) => {
            if (prop.definition.type == PropertyType.INPUT) {
                numIn++;
            } else if (prop.definition.type == PropertyType.OUTPUT) {
                numOut++;
            }
        });
        let numTotal = Math.max(numIn, numOut);
        let hiddenRadius = renderer.style.unit * 3;
        if (numTotal > 4) {
            hiddenRadius += renderer.style.unit * (numTotal - 4);
        }
        let width = renderer.context.measureText(this.node.definition.label).width + renderer.style.unit * 3 + hiddenRadius * 2;
        // TODO save collapseWidth
    
        const inCenter = new Point(hiddenRadius, hiddenRadius);
        const outCenter = new Point(width - hiddenRadius, hiddenRadius);
        const inAngleStep = Math.PI / (1.0 + numIn);
        const outAngleStep = -Math.PI / (1.0 + numOut);
        let inAngle = Math.PI / 2 + inAngleStep;
        let outAngle = Math.PI / 2 + outAngleStep;
        this.propertyViews.filter(prop => prop.property.definition.linkable).forEach(prop => {
            if (prop.property.definition.type == PropertyType.INPUT) {
                prop.connector = inCenter.offset(Math.cos(inAngle) * hiddenRadius, -Math.sin(inAngle) * hiddenRadius);
                inAngle += inAngleStep;
            } else if (prop.property.definition.type == PropertyType.OUTPUT) {
                prop.connector = outCenter.offset(Math.cos(outAngle) * hiddenRadius, -Math.sin(outAngle) * hiddenRadius);
                outAngle += outAngleStep;
            }
        });
        
        this.bounds = this.bounds.origin.rect(width, hiddenRadius * 2);
        this.labelBounds = this.bounds;
        this.collapseArrowCenter = this.bounds.origin.offset(hiddenRadius + renderer.style.unit, hiddenRadius);
    }
    
    layoutNode(renderer: Renderer) {
        this.updateBounds();
        if (this.node.collapsed) {
            this.layoutNodeCollapsed(renderer);
        } else {
            this.layoutNodeFull(renderer);
        }
    }

    draw(editor: Editor) {
        if (this.node.collapsed) {
            this.drawNodeCollapsed(editor);
        } else {
            this.drawNodeFull(editor);
        }
    }

    private drawNodeFull(editor: Editor) {
        const renderer = editor.renderer;
        const style = renderer.style;
    
        // TODO header and body should not overlap => header color not the same when collapsed
        renderer.roundBox()
            .filled(rgb(renderer.theme.NODE_BACK_COLOR))
            .shadow(this.parent == null)
            .draw(this.bounds);
        renderer.roundBox()
            .filled(rgb(renderer.graphicalHelper.getHeaderColor(this.node)))
            .corners(Corner.TopLeft | Corner.TopRight)
            .draw(this.labelBounds);
        
        renderer.roundBox()
            .line(this.isSelected ? 3 : 1)
            .stroke(rgb(this.isSelected ? renderer.theme.SELECTION_COLOR : renderer.theme.BORDER_COLOR))
            .draw(this.bounds);
    
        // TODO clip
    
        renderer.drawArrow(this.collapseArrowCenter, style.collapseArrowSize, Direction.DOWN, rgb(renderer.theme.TEXT_COLOR, 0.5));
        renderer.drawText(this.collapseArrowCenter.offset(style.unit * 2.5, style.unit), rgb(renderer.theme.TEXT_COLOR), this.node.definition.label)
        
        if (this.node.definition.preview) {
            const origin = this.bounds.origin.offset(0, this.previewOffset);
            this.drawPreview(renderer, origin);
        }
        this.propertyViews.forEach(prop => {
            prop.drawProperty(renderer, this.bounds.origin);
        });
    
    }
    
    private drawNodeCollapsed(editor: Editor) {
        const renderer = editor.renderer;
        const style = renderer.style;
        const radius = this.bounds.dimension.height / 2;
    
        renderer.roundBox(radius)
            .filled(rgb(renderer.graphicalHelper.getHeaderColor(this.node)))
            .shadow(this.parent == null)
            .draw(this.bounds);
    
        renderer.roundBox(radius)
            .line(this.isSelected ? 3 : 1)
            .stroke(rgb(this.isSelected ? renderer.theme.SELECTION_COLOR : renderer.theme.BORDER_COLOR))
            .draw(this.bounds);
    
        // TODO clip
    
        renderer.drawArrow(this.collapseArrowCenter, style.collapseArrowSize, Direction.RIGHT, rgb(renderer.theme.TEXT_COLOR, 0.5));
        renderer.drawText(this.collapseArrowCenter.offset(style.unit * 2.5, style.unit), rgb(renderer.theme.TEXT_COLOR), this.node.definition.label)
        
        this.propertyViews.forEach(prop => {
            if (!isNewPort(prop.property.definition.type)) {
                prop.drawConnector(renderer, this.bounds.origin);
            }
        });
    }
    
}

export class NodeFrameView implements FramableView, SelectableView {
    
    bounds: Rectangle;
    isSelected = false;
    parent: NodeFrameView = null;
    nodeViews: FramableView[];
    labelBounds: Rectangle;

    constructor(public frame: NodeFrame) {}
    
    updateChildren(framables: Map<Framable, FramableView>): void {
        this.nodeViews = this.frame.nodes.map(node => {
            const framableView = framables.get(node);
            framableView.parent = this;
            return framableView;
        });
    }

    getAllNodes(): NodeView[] {
        const result: NodeView[] = [];
        this.nodeViews.forEach(fv => {
            if ((<any>fv).node) {
                result.push(<NodeView>fv);
            } else {
                result.push(...(<NodeFrameView>fv).getAllNodes());
            }
        })
        return result;
    }

    draw(editor: Editor): void {
        const renderer = editor.renderer;
        const style = renderer.style;

        if (this.nodeViews.length > 0) {
            let bounds: Rectangle = undefined;
            this.nodeViews.forEach(nv => bounds = bounds ? bounds.union(nv.bounds) : nv.bounds);
            this.bounds = bounds.expand(20, 20).moveOrigin(0, 20-style.headerHeight);
            this.labelBounds = this.bounds.withHeight(style.unit*3);
        }

        renderer.roundBox()
            .filled(rgb(renderer.theme.FRAME_BACK_COLOR, renderer.theme.FRAME_COLOR_ALPHA))
            .shadow(this.parent == null)
            .draw(this.bounds);
        
        renderer.roundBox()
            .line(this.isSelected ? 3 : 1)
            .stroke(rgb(this.isSelected ? renderer.theme.SELECTION_COLOR : renderer.theme.BORDER_COLOR))
            .draw(this.bounds);

        renderer.drawText(this.bounds.middleTop().offset(0, style.unit*3), rgb(renderer.theme.TEXT_COLOR),
            this.frame.label, Align.CENTER);
    }

}

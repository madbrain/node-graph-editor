import { Point } from "./geometry";
import { labelHandler } from "./handlers";
import { ZoomState } from "./renderer";
import { CommonValueType, ValueDefinition } from './value';
import { NodePropertyView } from "./views";

export enum PropertyType {
    INPUT = "INPUT",
    OUTPUT = "OUTPUT",
    NEW_INPUT = "NEW_INPUT",
    NEW_OUTPUT = "NEW_OUTPUT"
}

export function isOutput(type: PropertyType) {
    return type == PropertyType.OUTPUT || type == PropertyType.NEW_OUTPUT;
}

export function isNewPort(type: PropertyType) {
    return type == PropertyType.NEW_INPUT || type == PropertyType.NEW_OUTPUT;
}

export interface PropertyDefinition {
    type: PropertyType;
    id: string;
    label: string;
    linkable?: boolean;
    editable?: boolean;
    valueType: ValueDefinition;
    defaultValue?: any;
}

export interface NodeDefinition {
    id: string;
    label: string;
    categories?: string;
    properties: PropertyDefinition[];
    preview?: boolean;
}

export abstract class Framable {
    parent?: NodeFrame;

    addToFrame(frame: NodeFrame) {
        if (this.parent) {
            this.parent.removeChild(this);
        }
        this.parent = frame;
        if (this.parent) {
            this.parent.addChild(this);
        }
    }
}

export class Node extends Framable {
    
    collapsed: boolean = false;
    fullWidth: number = 0;
    properties: NodeProperty[];

    constructor(public id: string, public definition: NodeDefinition, public location: Point) {
        super();
        this.properties = definition.properties.map(def => new NodeProperty(def, this));
    }

    findProperty(propName: string): NodeProperty {
        return this.properties.find(property => property.definition.id === propName);
    }

    findPropertyFromPath(propName: string): NodeProperty {
        const separatorPos = propName.indexOf(".");
        if (separatorPos > 0) {
            const mainName = propName.substring(0, separatorPos);
            const mainProperty = this.findProperty(mainName);
            if (!mainProperty) {
                return null;
            }
            const subPropertyName = propName.substring(separatorPos + 1);
            return mainProperty.findSubProperty(subPropertyName);
        }
        return this.findProperty(propName);
    }
}

export class NodeProperty {
    value: any;
    connections: NodeConnection[] = [];
    subProperties: NodeProperty[] = [];
    private knownSubProperties: NodeProperty[] = [];

    constructor(public definition: PropertyDefinition, public node: Node, public parent: NodeProperty = null) {
        this.value = definition.defaultValue; // TODO make a copy
    }

    isConnected() {
        return this.connections.length > 0;
    }
    
    isEditable() {
        if (! this.definition.editable) return false;
        // if (this.definition.valueType.type == CommonValueType.LABEL) return true;
        return !(this.definition.type == PropertyType.INPUT && this.isConnected()); 
    }

    refreshValue(value: any) {
        if (isNewPort(this.definition.type)) {
            this.knownSubProperties = Object.keys(value).map(key => this.makeSubProperty(key, value[key]));
        } else {
            this.value = value;
        }
    }

    setValue(value: any) {
        this.value = value;
        if (this.parent) {
            this.parent.setSubValue(this);
        }
    }

    getId() {
        let id = this.definition.id;
        if (this.parent) {
            id = this.parent.getId() + "." + id;
        }
        return id;
    }
    
    isRelatedTo(other: NodeProperty): boolean {
        if (other.parent) {
            other = other.parent;
        }
        if (this.parent) {
            return other.isRelatedTo(this);
        }
        return this == other;
    }

    findSubProperty(subPropertyName: string): NodeProperty {
        return this.knownSubProperties.find(property => property.definition.id === subPropertyName);
    }

    createSubProperty() {
        return this.makeSubProperty(newId());
    }

    private addSubProperty(subProperty: NodeProperty) {
        this.subProperties.push(subProperty);
        this.setSubValue(subProperty);
    }

    private setSubValue(subProperty: NodeProperty) {
        this.value = {...this.value, [subProperty.definition.id]: subProperty.value };
    }

    private removeSubProperty(subProperty: NodeProperty) {
        this.subProperties.splice(this.subProperties.indexOf(subProperty), 1);
        delete this.value[subProperty.definition.id];
    }

    private makeSubProperty(key: string, label: string = undefined) {
        if (! label) {
            label = `${this.definition.label}-${this.subProperties.length}`;
        }
        const definition: PropertyDefinition = {
            id: key,
            label: label,
            type: this.definition.type == PropertyType.NEW_INPUT ? PropertyType.INPUT : PropertyType.OUTPUT,
            valueType: this.definition.valueType,
            linkable: true,
            editable: this.definition.editable
        };
        const subProp = new NodeProperty(definition, this.node, this);
        subProp.value = label;
        return subProp;
    }

    getValue() {
        // TODO if input and connected get other side value
        return this.value;
    }

    connectTo(connection: NodeConnection) {
        if (this.connections.indexOf(connection) < 0) {
            this.connections.push(connection);
            if (this.parent && this.connections.length == 1) {
                this.parent.addSubProperty(this);
            }
        }
    }

    disconnectFrom(connection: NodeConnection) {
        const pos = this.connections.indexOf(connection);
        if (pos >= 0) {
            this.connections.splice(pos, 1);
            if (this.parent && this.connections.length == 0) {
                this.parent.removeSubProperty(this);
            }
        }
    }
    
}

export class NodeConnection {

    public from: NodeProperty;
    public to: NodeProperty;
    
    constructor(from: NodeProperty, to: NodeProperty) {
        if (isNewPort(from.definition.type)) {
            from = from.createSubProperty();
        }
        if (isNewPort(to.definition.type)) {
            to = to.createSubProperty();
        }
        function findPropertyByType(predicate: (t: PropertyType) => boolean) {
            if (predicate(from.definition.type)) {
                return from;
            }
            return to;
        }
        this.from = findPropertyByType(t => isOutput(t));
        this.to = findPropertyByType(t => !isOutput(t));
    }

    connect() {
        this.from.connectTo(this);
        this.to.connectTo(this);
    }

    disconnect() {
        this.from.disconnectFrom(this);
        this.to.disconnectFrom(this);
    }

    opposite(property: NodeProperty): NodeProperty {
        if (this.from == property) {
            return this.to;
        } else if (this.to == property) {
            return this.from;
        } else {
            return null;
        }
    }
}

export class NodeFrame extends Framable {
    
    nodes: Framable[] = [];

    constructor(public label: string) {
        super()
    }

    addChild(node: Framable) {
        this.nodes.push(node);
    }

    removeChild(node: Framable) {
        this.nodes.splice(this.nodes.indexOf(node), 1);
    }
}

export interface NodeGroup {
    nodes: Node[];
    frames: NodeFrame[];
    zoomState?: ZoomState;
}

export interface NodeGroupIO {
    nodes: (NodeIO | FrameIO)[];
    connections: NodeConnectionIO[];
    canvas?: {
        position: { x: number, y: number },
        zoom: number;
    }
}

export interface FrameIO {
    kind?: "frame",
    label: string;
    nodes: (NodeIO | FrameIO)[];
}

export interface NodeIO {
    kind?: "node",
    id: string;
    type: string;
    location: { x: number, y: number };
    collapsed?: boolean;
    fullWidth?: number;
    properties?: { [name: string]: any };
}

export interface NodeConnectionIO {
    from: { node: string, property: string};
    to: { node: string, property: string};
}

class LoadContext {
    nodeMap = new Map<string, Node>();
    nodes: Node[] = [];
    frames: NodeFrame[] = [];

    constructor(private nodeRegistry: NodeRegistry) {}
    
    load(nodeGroupIO: NodeGroupIO) {
        nodeGroupIO.nodes.forEach(n => this.loadFramable(n, null));
    }

    private loadFramable(n: NodeIO | FrameIO, parent: NodeFrame): Framable {
        if (n.kind == "frame") {
            const frame = new NodeFrame(n.label);
            n.nodes.forEach(n => frame.addChild(this.loadFramable(n, frame)));
            if (! parent) {
                this.frames.push(frame);
            }
            return frame;
        } else {
            const node = new Node(n.id, this.nodeRegistry.lookup(n.type), new Point(n.location.x, n.location.y));
            node.collapsed = n.collapsed || false;
            node.fullWidth = n.fullWidth || 0;
            if (n.properties) {
                for (let name in n.properties) {
                    const value = n.properties[name];
                    node.findProperty(name).refreshValue(value);
                }
            }
            this.nodeMap.set(node.id, node);
            this.nodes.push(node);
            return node;
        }
    }
}

class SaveContext {
    connections = [];
    nodes: (NodeIO | FrameIO)[] = [];
    seenNodes = [];

    save(nodeGroup: NodeGroup) {
        nodeGroup.frames.forEach(f => {
            this.nodes.push(this.saveFrame(f));
        });
        nodeGroup.nodes
            .filter(n => this.seenNodes.indexOf(n) < 0)
            .forEach(n => {
                this.nodes.push(this.saveNode(n));
            });
    }

    private saveFramable(f: Framable): FrameIO | NodeIO {
        if ((f as any).definition) {
            return this.saveNode(<Node>f);
        }
        return this.saveFrame(<NodeFrame>f);
    }

    private saveFrame(f: NodeFrame): FrameIO {
        return { kind: "frame", label: f.label, nodes: f.nodes.map(n => this.saveFramable(n))}
    }

    private saveConnection(c: NodeConnection) {
        this.connections.push({
            from: { node: c.from.node.id, property: c.from.getId() },
            to: { node: c.to.node.id, property: c.to.getId() },
        });
    }

    private saveNode(n: Node) {
        this.seenNodes.push(n);
        const properties = {};
        let hasProperties = false;
        n.properties.forEach(prop => {
            if (prop.value !== undefined) {
                properties[prop.definition.id] = prop.value;
                hasProperties = true;
            }
            if (isOutput(prop.definition.type) && prop.connections) {
                prop.connections.forEach(c => this.saveConnection(c));
                prop.subProperties.forEach(subProp => {
                    subProp.connections.forEach(c => this.saveConnection(c))
                });
            }
        });
        const node: NodeIO = {
            id: n.id,
            type: n.definition.id,
            location: { x: n.location.x, y: n.location.y }
        };
        if (n.collapsed) {
            node.collapsed = true;
        }
        if (n.fullWidth > 0) {
            node.fullWidth = n.fullWidth;
        }
        if (hasProperties) {
            node.properties = properties;
        }
        return node;
    }
}

function newId() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = '';
    for (let i = 0; i < 16; ++i) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

export interface NodeRegistry {
    all(): NodeDefinition[];
    lookup(type: string): NodeDefinition;
}

export class DefaultNodeRegistry implements NodeRegistry {
    private nodeDefinitionByType: { [key: string]: NodeDefinition } = {};

    constructor (private nodeDefinitions: NodeDefinition[]) {
        nodeDefinitions.forEach(nodeDefinition => {
            this.nodeDefinitionByType[nodeDefinition.id] = nodeDefinition;
        });
    }

    lookup(type: string): NodeDefinition {
        return this.nodeDefinitionByType[type];
    }

    all() {
        return this.nodeDefinitions;
    }
}

export class NodeFactory {
    constructor (private nodeRegistry: NodeRegistry) { }

    getNodeDefinitions() {
        return this.nodeRegistry.all();
    }

    createNode(type: string, location: Point): Node {
        const nodeDefinition = this.nodeRegistry.lookup(type);
        if (! nodeDefinition) {
            throw new Error(`unknown node type ${type}`);
        }
        return new Node(newId(), nodeDefinition, location);
    }

    load(nodeGroupIO: NodeGroupIO): NodeGroup {
        const context = new LoadContext(this.nodeRegistry);
        context.load(nodeGroupIO);
        nodeGroupIO.connections.forEach(connection => {
            const fromProp = context.nodeMap.get(connection.from.node).findPropertyFromPath(connection.from.property);
            const toProp   = context.nodeMap.get(connection.to.node).findPropertyFromPath(connection.to.property);
            new NodeConnection(fromProp, toProp).connect();
        });
        const zoomState = new ZoomState();
        if (nodeGroupIO.canvas) {
            zoomState.update(new Point(nodeGroupIO.canvas.position.x || 0, nodeGroupIO.canvas.position.y || 0), nodeGroupIO.canvas.zoom || 1.0);
        }
        return {
            nodes: context.nodes,
            frames: context.frames,
            zoomState
        };
    }

    save(nodeGroup: NodeGroup): NodeGroupIO {
        const context = new SaveContext();
        context.save(nodeGroup);
        return {
            nodes: context.nodes,
            connections: context.connections,
            canvas: {
                position: { x: nodeGroup.zoomState.origin.x, y: nodeGroup.zoomState.origin.y },
                zoom: nodeGroup.zoomState.scale
            }
        };
    }

}
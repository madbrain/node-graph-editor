import { Point, Rectangle } from "./geometry";
import { ZoomState } from "./renderer";
import { ValueDefinition } from './value';

export enum PropertyType {
    INPUT = "INPUT",
    OUTPUT = "OUTPUT",
    // NEW_INPUT
    // NEW_OUTPUT
}

export interface PropertyDefinition {
    type: PropertyType;
    id: string,
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
}

export class NodeProperty {
   
    value: any;
    connections: NodeConnection[] = [];

    constructor(public definition: PropertyDefinition, public node: Node) {
        this.value = definition.defaultValue; // TODO make a copy
    }

    isConnected() {
        return this.connections.length > 0;
    }
    
    isEditable() {
        if (! this.definition.editable) return false;
        return !(this.definition.type == PropertyType.INPUT && this.isConnected()); 
    }

    getValue() {
        // TODO if input and connected get other side value
        return this.value;
    }

    connectTo(connection: NodeConnection) {
        if (this.connections.indexOf(connection) < 0) {
            this.connections.push(connection);
        }
    }

    disconnectFrom(connection: NodeConnection) {
        const pos = this.connections.indexOf(connection);
        if (pos >= 0) {
            this.connections.splice(pos, 1);
        }
    }
    
}

export class NodeConnection {

    public from: NodeProperty;
    public to: NodeProperty;
    
    constructor(from: NodeProperty, to: NodeProperty) {
        function findPropertyByType(type: PropertyType) {
            if (from.definition.type == type) {
                return from;
            }
            return to;
        }
        this.from = findPropertyByType(PropertyType.OUTPUT);
        this.to = findPropertyByType(PropertyType.INPUT);
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
    nodes: NodeIO[];
    connections: NodeConnectionIO[];
    canvas?: {
        position: { x: number, y: number },
        zoom: number;
    }
}

export interface NodeIO {
    id: string;
    type: string;
    location: {x: number, y: number };
    collapsed?: boolean;
    fullWidth?: number;
    properties?: { [name: string]: any };
}

export interface NodeConnectionIO {
    from: { node: string, property: string};
    to: { node: string, property: string};
}

export class NodeFactory {
    private nodeDefinitionByType: { [key: string]: NodeDefinition } = {};

    constructor (private nodeDefinitions: NodeDefinition[]) {
        nodeDefinitions.forEach(nodeDefinition => {
            this.nodeDefinitionByType[nodeDefinition.id] = nodeDefinition;
        });
    }

    getNodeDefinitions() {
        return this.nodeDefinitions;
    }

    createNode(type: string, location: Point): Node {
        const nodeDefinition = this.nodeDefinitionByType[type];
        if (! nodeDefinition) {
            throw new Error(`unknown node type ${type}`);
        }
        return new Node(this.newId(), nodeDefinition, location);
    }

    private newId() {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = '';
        for (let i = 0; i < 16; ++i) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    }

    load(nodeGroupIO: NodeGroupIO): NodeGroup {
        const nodeMap = new Map<string, Node>();
        const nodes = nodeGroupIO.nodes.map(n => {
            const node = new Node(n.id, this.nodeDefinitionByType[n.type], new Point(n.location.x, n.location.y));
            node.collapsed = n.collapsed || false;
            node.fullWidth = n.fullWidth || 0;
            if (n.properties) {
                for (let name in n.properties) {
                    const value = n.properties[name];
                    node.findProperty(name).value = value;
                }
            }
            nodeMap.set(node.id, node);
            return node;
        });
        nodeGroupIO.connections.forEach(connection => {
            const fromProp = nodeMap.get(connection.from.node).findProperty(connection.from.property);
            const toProp   = nodeMap.get(connection.to.node).findProperty(connection.to.property);
            new NodeConnection(fromProp, toProp).connect();
        });
        const zoomState = new ZoomState();
        if (nodeGroupIO.canvas) {
            zoomState.update(new Point(nodeGroupIO.canvas.position.x || 0, nodeGroupIO.canvas.position.y || 0), nodeGroupIO.canvas.zoom || 1.0);
        }
        return {
            nodes,
            frames: [],
            zoomState
        };
    }

    save(nodeGroup: NodeGroup): NodeGroupIO {
        const connections = [];
        const nodes: NodeIO[] = nodeGroup.nodes.map(n => {
            const properties = {};
            let hasProperties = false;
            n.properties.forEach(prop => {
                if (prop.value !== undefined) {
                    properties[prop.definition.id] = prop.value;
                    hasProperties = true;
                }
                if (prop.definition.type === PropertyType.OUTPUT && prop.connections) {
                    prop.connections.forEach(c => {
                        connections.push({
                            from: { node: c.from.node.id, property: c.from.definition.id },
                            to: { node: c.to.node.id, property: c.to.definition.id },
                        })
                    })
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
        });
        return {
            nodes,
            connections,
            canvas: {
                position: { x: nodeGroup.zoomState.origin.x, y: nodeGroup.zoomState.origin.y },
                zoom: nodeGroup.zoomState.scale
            }
        };
    }

}
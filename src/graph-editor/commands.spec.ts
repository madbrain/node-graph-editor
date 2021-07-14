import { CommandStack } from "./command-stack";
import { AddNodeCommand, ChangePropertyValueCommand, CreateConnectionCommand, DeleteNodesCommand, MoveNodeCommand, RemoveConnectionCommand, ResizeNodeCommand, ToggleCollapseCommand } from "./commands";
import { Dimension, Point } from "./geometry";
import { NodeDefinition, NodeFactory, PropertyType } from "./nodes";

const nodeDefinitions: NodeDefinition[] = [
    {
        id: "test-node",
        label: "Test Node",
        properties: [
            {
                id: "out0",
                label: "Out 0",
                type: PropertyType.OUTPUT,
                valueType: { type: "string" }
            },
            {
                id: "in0",
                label: "In 0",
                type: PropertyType.INPUT,
                valueType: { type: "string" }
            }
        ]
    }
];
const nodeFactory = new NodeFactory(nodeDefinitions);

describe("Node", () => {

    it("can move", () => {
        const commandStack = new CommandStack();
        const node = nodeFactory.createNode("test-node", new Point(10, 20));
        expect(node.location).toEqual(new Point(10, 20));
        commandStack.emit(new MoveNodeCommand([ { node, startPosition: node.location, endPosition: new Point(40, 50) } ]));
        expect(node.location).toEqual(new Point(40, 50));
    });

    it("can be collapsed", () => {
        const commandStack = new CommandStack();
        const node = nodeFactory.createNode("test-node", new Point(10, 20));
        expect(node.collapsed).toBeFalsy();
        commandStack.emit(new ToggleCollapseCommand(node));
        expect(node.collapsed).toBeTruthy();
    });

    it("can be connected", () => {
        const commandStack = new CommandStack();
        const node1 = nodeFactory.createNode("test-node", new Point(10, 20));
        const node2 = nodeFactory.createNode("test-node", new Point(50, 20));
        expect(node1.findProperty("out0").isConnected()).toBeFalsy();
        commandStack.emit(new CreateConnectionCommand(node1.findProperty("out0"), node2.findProperty("in0")));
        expect(node1.findProperty("out0").isConnected()).toBeTruthy();
    });

    it("can be unconnected", () => {
        const commandStack = new CommandStack();
        const node1 = nodeFactory.createNode("test-node", new Point(10, 20));
        const node2 = nodeFactory.createNode("test-node", new Point(50, 20));
        commandStack.emit(new CreateConnectionCommand(node1.findProperty("out0"), node2.findProperty("in0")));
        commandStack.emit(new RemoveConnectionCommand(node1.findProperty("out0").connections[0]));
        expect(node1.findProperty("out0").isConnected()).toBeFalsy();
    });

    it("can be added", () => {
        const commandStack = new CommandStack();
        const node1 = nodeFactory.createNode("test-node", new Point(10, 20));
        const nodeGroup = { nodes: [], frames: [] };
        commandStack.emit(new AddNodeCommand(nodeGroup, node1));
        expect(nodeGroup.nodes).toContain(node1);
    });

    it("can be deleted", () => {
        const commandStack = new CommandStack();
        const node1 = nodeFactory.createNode("test-node", new Point(10, 20));
        const node2 = nodeFactory.createNode("test-node", new Point(50, 20));
        const nodeGroup = { nodes: [ node1, node2 ], frames: [] };
        commandStack.emit(new CreateConnectionCommand(node1.findProperty("out0"), node2.findProperty("in0")));
        commandStack.emit(new DeleteNodesCommand(nodeGroup, [ node1 ], []));
        expect(nodeGroup.nodes).not.toContain(node1);
        expect(nodeGroup.nodes).toContain(node2);
        expect(node2.findProperty("in0").isConnected()).toBeFalsy();
    });

    it("property can be changed", () => {
        const commandStack = new CommandStack();
        const node1 = nodeFactory.createNode("test-node", new Point(10, 20));
        const property = node1.findProperty("in0");
        expect(property.getValue()).toBeUndefined();
        commandStack.emit(new ChangePropertyValueCommand(property, "new value"));
        expect(property.getValue()).toEqual("new value");
    });

    it("can be resized", () => {
        const commandStack = new CommandStack();
        const node1 = nodeFactory.createNode("test-node", new Point(10, 20));
        expect(node1.fullWidth).toEqual(0);
        commandStack.emit(new ResizeNodeCommand(node1, new Dimension(100, 50)));
        expect(node1.fullWidth).toEqual(100);
    });
});
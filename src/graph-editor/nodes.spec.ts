import { CommandStack } from "./command-stack";
import { AddNodeCommand, ChangePropertyValueCommand, CreateConnectionCommand, DeleteNodesCommand, MoveNodeCommand, RemoveConnectionCommand, ResizeNodeCommand, ToggleCollapseCommand } from "./commands";
import { Dimension, Point } from "./geometry";
import { NodeDefinition, NodeFactory, NodeGroupIO, PropertyType } from "./nodes";

const nodeDefinitions: NodeDefinition[] = [
    {
        id: "test-node0",
        label: "Test Node 0",
        properties: [
            {
                id: "out0",
                label: "Out 0",
                type: PropertyType.OUTPUT,
                valueType: { type: "string" }
            }
        ]
    },
    {
        id: "test-node1",
        label: "Test Node 1",
        properties: [
            {
                id: "in0",
                label: "In 0",
                type: PropertyType.INPUT,
                valueType: { type: "string" }
            },
            {
                id: "in1",
                label: "In 1",
                type: PropertyType.INPUT,
                valueType: { type: "string" }
            },
            {
                id: "out0",
                label: "Out 1",
                type: PropertyType.OUTPUT,
                valueType: { type: "string" }
            }
        ]
    }
];
const nodeFactory = new NodeFactory(nodeDefinitions);

describe("NodeFactory", () => {

    it("can load", () => {
        const graph: NodeGroupIO = {
            nodes: [
              { id: "n0", type: "test-node0", location: { x: 100, y: 100} },
              { id: "n1", type: "test-node1", location: { x: 400, y: 100}, properties: { "in1": "test" } },
              { id: "n2", type: "test-node1", location: { x: 700, y: 100}, collapsed: true },
            ],
            connections: [
              { from: { node: "n0", property: "out0"}, to: { node: "n1", property: "in0" } },
              { from: { node: "n1", property: "out0"}, to: { node: "n2", property: "in0" } },
            ],
            canvas: {
                position: { x: 0, y: 0},
                zoom: 1.0
            }
        };
        const nodeGroup = nodeFactory.load(graph);
        expect(nodeGroup.nodes).toHaveLength(3);
        expect(nodeGroup.nodes[0].id).toEqual("n0");
        expect(nodeGroup.nodes[0].definition.id).toEqual("test-node0");
        expect(nodeGroup.nodes[0].location).toEqual(new Point(100, 100));
        expect(nodeGroup.nodes[0].collapsed).toBeFalsy();

        expect(nodeGroup.nodes[1].id).toEqual("n1");
        expect(nodeGroup.nodes[1].definition.id).toEqual("test-node1");
        expect(nodeGroup.nodes[1].location).toEqual(new Point(400, 100));
        expect(nodeGroup.nodes[1].collapsed).toBeFalsy();
        expect(nodeGroup.nodes[1].findProperty("in1").value).toEqual("test");

        expect(nodeGroup.nodes[2].id).toEqual("n2");
        expect(nodeGroup.nodes[2].definition.id).toEqual("test-node1");
        expect(nodeGroup.nodes[2].location).toEqual(new Point(700, 100));
        expect(nodeGroup.nodes[2].collapsed).toBeTruthy();

        expect(nodeGroup.nodes[0].findProperty("out0").connections).toHaveLength(1);
        expect(nodeGroup.nodes[0].findProperty("out0").connections[0].to).toBe(nodeGroup.nodes[1].findProperty("in0"));
        expect(nodeGroup.nodes[1].findProperty("in0").connections).toHaveLength(1);
        expect(nodeGroup.nodes[1].findProperty("in0").connections[0].from).toBe(nodeGroup.nodes[0].findProperty("out0"));

        expect(nodeGroup.nodes[1].findProperty("out0").connections).toHaveLength(1);
        expect(nodeGroup.nodes[1].findProperty("out0").connections[0].to).toBe(nodeGroup.nodes[2].findProperty("in0"));
        expect(nodeGroup.nodes[2].findProperty("in0").connections).toHaveLength(1);
        expect(nodeGroup.nodes[2].findProperty("in0").connections[0].from).toBe(nodeGroup.nodes[1].findProperty("out0"));

    });

    it("can save", () => {
        const graph: NodeGroupIO = {
            nodes: [
              { id: "n0", type: "test-node0", location: { x: 100, y: 100} },
              { id: "n1", type: "test-node1", location: { x: 400, y: 100}, properties: { "in1": "test" } },
              { id: "n2", type: "test-node1", location: { x: 700, y: 100}, collapsed: true },
            ],
            connections: [
              { from: { node: "n0", property: "out0"}, to: { node: "n1", property: "in0" } },
              { from: { node: "n1", property: "out0"}, to: { node: "n2", property: "in0" } },
            ],
            canvas: {
                position: {x: 10, y: 20},
                zoom: 2.1
            }
        };
        const result = nodeFactory.save(nodeFactory.load(graph));
        expect(result).toEqual(graph);
    });

});
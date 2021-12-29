import { Command } from "./command-stack";
import { Dimension, Point } from "./geometry";
import { NodeConnection, NodeProperty, Node, NodeGroup, NodeFrame, Framable } from "./nodes";

export class CompositeCommand implements Command {
    isVisual = false; // TODO also test composite
    constructor(private commands: Command[]) {}

    execute() {
        this.commands.forEach(command => command.execute());
    }

    undo() {
        this.commands.forEach(command => command.undo());
    }

    redo() {
        this.commands.forEach(command => command.redo());
    }

}

export interface NodeMove {
    node: Node;
    startPosition: Point;
    endPosition: Point;
}

export class MoveNodeCommand implements Command {
    isVisual = true;

    constructor(private moves: NodeMove[]) {}

    execute() {
        this.moves.forEach(move => {
            move.node.location = move.endPosition;
        });
    }

    undo() {
        this.moves.forEach(move => {
            move.node.location = move.startPosition;
        });
    }

    redo() {
        this.execute();
    }

}

export class ToggleCollapseCommand implements Command {
    isVisual = true;

    newCollapsed: boolean;

    constructor(private node: Node) {
        this.newCollapsed = ! node.collapsed;
    }

    execute() {
        this.node.collapsed = this.newCollapsed;
    }

    undo() {
        this.node.collapsed = ! this.newCollapsed;
    }

    redo() {
        this.execute();
    }

}

export class CreateConnectionCommand implements Command {
    isVisual = false;
    connection: NodeConnection;

    constructor(private fromProperty: NodeProperty, private toProperty: NodeProperty) {}

    execute() {
        this.connection = new NodeConnection(this.fromProperty, this.toProperty);
        this.connection.connect();
    }

    undo() {
        this.connection.disconnect();
    }

    redo() {
        this.connection.connect();
    }

}

export class RemoveConnectionCommand implements Command {
    isVisual = false;
    constructor(private connection: NodeConnection) {}

    execute() {
        this.redo();
    }

    undo() {
        this.connection.connect();
    }

    redo() {
        this.connection.disconnect();
    }

}

export class AddNodeCommand implements Command {
    isVisual = false;
    constructor(private nodeGroup: NodeGroup, private node: Node) {}

    execute() {
        this.redo();
    }

    undo() {
        const pos = this.nodeGroup.nodes.indexOf(this.node);
        this.nodeGroup.nodes.splice(pos, 1);
    }

    redo() {
        this.nodeGroup.nodes.push(this.node);
    }

}

export class DeleteNodesCommand implements Command {
    isVisual = false;

    private connections: NodeConnection[] = [];
    private frameParents = new Map<NodeFrame, NodeFrame>();

    constructor(private nodeGroup: NodeGroup, private nodes: Node[], private frames: NodeFrame[]) {
        this.connections = [];
        nodes.forEach(node => {
            node.properties.forEach(property => {
                property.connections.forEach(connection => {
                    if (this.connections.indexOf(connection) < 0) {
                        this.connections.push(connection);
                    }
                });
            });
        });
        frames.forEach(frame => {
            this.frameParents.set(frame, frame.parent);
        })
    }

    execute() {
        for (let [frame, parent] of this.frameParents.entries()) {
            if (parent) {
                console.log("TODO remove a frame from another frame")
            } else {
                this.nodeGroup.frames.splice(this.nodeGroup.frames.indexOf(frame), 1);
            }
        }
        this.nodeGroup.nodes = this.nodeGroup.nodes.filter(n => this.nodes.indexOf(n) < 0);
        this.connections.forEach(connection => connection.disconnect());
    }

    undo() {
        for (let [frame, parent] of this.frameParents.entries()) {
            if (parent) {
                console.log("TODO UNDO remove a frame from another frame")
            } else {
                this.nodeGroup.frames.push(frame);
            }
        }
        this.nodeGroup.nodes = this.nodeGroup.nodes.concat(this.nodes);
        this.connections.forEach(connection => connection.connect());
    }

    redo() {
        this.execute();
    }

}

export class ChangePropertyValueCommand implements Command {
    isVisual = false;
    oldValue: any;

    constructor(private property: NodeProperty, private newValue: any) {
        this.oldValue = property.value;
    }

    execute() {
        this.property.setValue(this.newValue);
    }

    undo() {
        this.property.setValue(this.oldValue);
    }

    redo() {
        this.execute();
    }

}

export class ResizeNodeCommand implements Command {
    isVisual = true;
    oldWidth: number;

    constructor(private node: Node, private dimension: Dimension) {
        this.oldWidth = node.fullWidth;
    }

    execute() {
        this.node.fullWidth = this.dimension.width;
    }

    undo() {
        this.node.fullWidth = this.oldWidth;
    }

    redo() {
        this.execute();
    }

}

export class JoinInNewFrameCommand implements Command {
    isVisual = true;
    frame: NodeFrame;
    oldParents = new Map<Framable, NodeFrame>();

    constructor(private nodeGroup: NodeGroup, private nodes: Framable[]) {
        this.frame = new NodeFrame("Frame");
        nodes.forEach(node => this.oldParents.set(node, node.parent));
    }

    execute() {
        this.nodeGroup.frames.push(this.frame);
        this.nodes.forEach(node => node.addToFrame(this.frame));
    }

    undo() {
        this.oldParents.forEach((frame, node) => node.addToFrame(frame));
        this.nodeGroup.frames.splice(this.nodeGroup.frames.indexOf(this.frame), 1);
    }

    redo() {
        this.execute();
    }
}

export class RemoveFromFrameCommand implements Command {
    isVisual = true;
    oldParents = new Map<Framable, NodeFrame>();

    constructor(private nodes: Framable[]) {
        nodes.forEach(node => {
            this.oldParents.set(node, node.parent);
        })
    }

    execute() {
        this.nodes.forEach(node => node.addToFrame(null));
    }

    undo() {
        this.nodes.forEach(node => node.addToFrame(this.oldParents.get(node)));
    }

    redo() {
        this.execute();
    }
}

export class RenameFrameCommand implements Command {
    isVisual = true;
    oldLabel: string;

    constructor(private frame: NodeFrame, private newLabel: string) {
        this.oldLabel = frame.label;
    }

    execute() {
        this.frame.label = this.newLabel;
    }

    undo() {
        this.frame.label = this.oldLabel;
    }

    redo() {
        this.execute();
    }
}
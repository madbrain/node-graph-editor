import { Command } from "./command-stack";
import { NodeFrameView, NodeView, SelectableView } from "./views";
import { Point } from "./geometry";
import { NodeGroup, NodeProperty } from "./nodes";
import { Renderer } from "./renderer";

export enum ControlKey {
    CtrlKey  = 1,
    AltKey   = 2,
    ShiftKey = 4,
}

export interface Event {
    position: Point;
    screenPosition: Point;
    specialKeys: number;
    deltaY?: number;
    key?: string;
}

export enum SelectionMode {
    ADD,
    REMOVE,
    REPLACE
}

export class State {
    handleMouseMove(editor: Editor, event: Event): State {
        return this;
    }

    handleMouseUp(editor: Editor, event: Event): State {
        return this;
    }

    handleMouseDown(editor: Editor, event: Event): State {
        return this;
    }

    handleMouseWheel(editor: Editor, event: Event): State {
        return this;
    }

    handleKeyUp(editor: Editor, event: Event): State {
        return this;
    }
}

export interface VisualFeedback {
    foreground?: boolean;
    draw(editor: Editor);
}

export interface SelectorResult {
    state: State;
    result: Promise<any>;
}

export interface KeyMapping {
    meta: number;
    key: string;
    action: string;
}

export interface Editor {
    
    nodeGroup: NodeGroup;
    renderer: Renderer;
    nodeViews: NodeView[];
    frameViews: NodeFrameView[];
    selection: SelectableView[];
    keymap: KeyMapping[];
    
    select(nodes: SelectableView[], mode: SelectionMode);
    
    updatePosition(offset: Point);
    updateZoom(offset: Point, zoomFactor: number);

    canConnect(from: NodeProperty, to: NodeProperty);

    emit(command: Command);

    addFeedback(feedback: VisualFeedback);
    removeFeedback(feedback: VisualFeedback);
    draw();

    openSelector(position: Point, name: string, context: any): SelectorResult;
    doAction(name: string): State;

    onGraphChange(callback: (nodeGroup: NodeGroup) => void);

}
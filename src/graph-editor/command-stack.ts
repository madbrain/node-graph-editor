
export interface Command {
    isVisual: boolean;
    execute();
    undo();
    redo();
}

export interface CommandStackListener {
    onStackChange(isVisual: boolean);
}

export class CommandStack {
    commands: Command[] = [];
    undoIndex = -1;
    private listeners: CommandStackListener[] = [];

    emit(command: Command) {
        const MAX_UNDO = 20;
        if (this.undoIndex < this.commands.length-1) {
            const diff = this.commands.length - this.undoIndex ;
            this.commands.splice(this.undoIndex + 1, diff);
        }
        this.commands.push(command);
        this.undoIndex += 1;
        if (this.commands.length > MAX_UNDO) {
            this.commands.splice(0, this.commands.length - MAX_UNDO);
            this.undoIndex = this.commands.length - 1;
        }
        command.execute();
        this.fire(command.isVisual);
    }

    undo() {
        if (this.undoIndex >= 0) {
            const command = this.commands[this.undoIndex];
            command.undo();
            this.fire(command.isVisual);
            this.undoIndex -= 1;
        }
    }

    redo() {
        if (this.undoIndex < (this.commands.length-1)) {
            this.undoIndex += 1;
            const command = this.commands[this.undoIndex];
            command.redo();
            this.fire(command.isVisual);
        }
    }

    addListener(listener: CommandStackListener) {
        this.listeners.push(listener);
    }

    clear() {
        this.commands = [];
    }

    private fire(isVisual: boolean) {
        this.listeners.forEach(listener => listener.onStackChange(isVisual))
    }
}
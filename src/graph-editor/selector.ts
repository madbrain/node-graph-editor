import { Point } from "./geometry";

export abstract class Selector {
    protected glassPane: HTMLElement;
    protected selectorEl: HTMLElement;

    constructor() {
        this.glassPane = document.createElement("div");
        this.glassPane.classList.add("selector-glass-pane", "hide");
        this.glassPane.addEventListener("click", e => this.glassPaneClose(e));
        this.selectorEl = document.createElement("div");
        this.selectorEl.classList.add("selector");
        this.glassPane.appendChild(this.selectorEl);
    }

    el() {
        return this.glassPane;
    }

    open(position: Point, context: any): Promise<any> {
        this.glassPane.classList.remove("hide");
        this.selectorEl.style.left = `${position.x}px`;
        this.selectorEl.style.top = `${position.y}px`;
        return this.internalOpen(position, context);
    }

    protected abstract internalOpen(position: Point, context: any): Promise<any>;

    close() {
        this.glassPane.classList.add("hide");
    }

    private glassPaneClose(ev) {
        if (ev.target == this.glassPane) {
            this.close();
        }
    }

}



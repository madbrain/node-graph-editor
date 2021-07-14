import { Point } from './geometry';
import { Selector } from './selector';
import { collectLeaves, TreeNode } from './tree';

interface UiNode extends TreeNode {
    parentIndex?: number;
}

export class TreeSelector extends Selector {
    private inputElement: HTMLInputElement;
    private listEl: HTMLUListElement; 
    private leaves: TreeNode[] = [];
    private current: UiNode[] = [];
    private selection = -1;
    private nodes: UiNode[];
    private elements: HTMLElement[];
    private resolve: (value: any) => void;
    private reject: () => void;

    constructor() {
        super();
        this.inputElement = document.createElement("input");
        this.inputElement.classList.add("tree-selector");
        this.inputElement.addEventListener("keyup", e => this.keyUp(e));
        this.selectorEl.appendChild(this.inputElement);

        this.listEl = document.createElement("ul");
        this.listEl.classList.add("tree-selector");
        this.selectorEl.appendChild(this.listEl);
    }

    protected internalOpen(position: Point, ctxt: any): Promise<any> {
        const { nodes } = ctxt;
        this.current = nodes;
        this.leaves = collectLeaves(this.current);
        this.selection = -1;
        this.inputElement.value = "";
        this.update();
        setTimeout(() => this.inputElement.focus(), 0);
        return new Promise<any>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        })
    }

    close() {
        super.close();
        this.reject();
    }

    private selectItem(node: UiNode, index: number, next: number) {
        if (node.parentIndex != undefined) {
            this.current = node.children;
            this.update();
            this.updateSelection(node.parentIndex);
        } else if (node.children && node.children.length > 0) {
            this.current = [ { name: "..", title: "..", parentIndex: index, children: this.current }, ...node.children ];
            this.update();
            this.updateSelection(next);
        } else {
            super.close();
            this.resolve(node);
        }
    }

    private keyUp(e) {
        if (e.key == "Escape") {
            this.close();
        } else if (e.key == "ArrowDown") {
            this.updateSelection(Math.min(this.selection + 1, this.nodes.length - 1));
        } else if (e.key == "ArrowUp") {
            this.updateSelection(Math.max(this.selection - 1, 0));
        } else if (e.key == "ArrowLeft") {
            if (this.current[0].parentIndex != undefined) {
                const node = this.current[0];
                this.current = node.children;
                this.update();
                this.updateSelection(node.parentIndex);
            }
        } else if (e.key == "Enter") {
            if (this.selection >= 0) {
                this.selectItem(this.nodes[this.selection], this.selection, 0);
            }
        } else if (e.key == "ArrowRight") {
            if (this.selection >= 0 && this.current[this.selection].parentIndex == undefined
                    && this.current[this.selection].children && this.current[this.selection].children.length > 0) {
                this.selectItem(this.nodes[this.selection], this.selection, 0);
            }
        } else {
            this.update();
        }
    }

    private filterTree(q: string) {
        // TODO create an index for multi word search
        return this.leaves.filter(node => node.title && node.title.toLowerCase().indexOf(q.toLowerCase()) >= 0);
    }

    private updateSelection(value: number) {
        this.selection = value;
        this.elements.forEach(e => e.classList.remove("selected"));
        if (this.selection >= 0) {
            this.elements[this.selection].classList.add("selected");
        }
    }

    private update() {
        const filter = this.inputElement.value;
        const oldNodes = this.nodes;
        this.nodes = filter.length > 0 ? this.filterTree(filter) : this.current;
        if (this.nodes != oldNodes) {
            while (this.listEl.firstChild) {
                this.listEl.removeChild(this.listEl.lastChild);
            }
            this.elements = this.nodes.map((node, i) => {
                const liEl = document.createElement("li");
                liEl.addEventListener("click", e => this.selectItem(node, i, -1));
                if (i == this.selection) {
                    this.listEl.classList.add("selected");
                }
                this.listEl.appendChild(liEl);
                const spanEl = document.createElement("span");
                spanEl.textContent = node.title ? node.title : node.name;
                liEl.appendChild(spanEl);
                return liEl;
            });
        }
    }
    
}
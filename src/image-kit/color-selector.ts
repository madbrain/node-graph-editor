import { Selector } from '../graph-editor/selector';
import { HsvColor, hsvToRgb, rgbToHsv } from './color';
import { Point } from '../graph-editor/geometry';
import { rgb } from '../graph-editor/renderer';

export class ColorSelector extends Selector {

    private hueSelectElement: HTMLCanvasElement;
    private lightSelectElement: HTMLCanvasElement;
    private resultElement: HTMLElement;
    private hueContext: CanvasRenderingContext2D;
    private lightContext: CanvasRenderingContext2D;
    private color: HsvColor = { h: 0, s: 0, v: 0 };

    private resolve: (value: any) => void;
    private reject: () => void;

    constructor() {
        super();
        this.hueSelectElement = document.createElement("canvas");
        this.hueSelectElement.width = 200;
        this.hueSelectElement.height = 50;
        this.hueSelectElement.addEventListener("click", e => this.selectHue(e));
        this.hueSelectElement.classList.add("hue");
        this.selectorEl.appendChild(this.hueSelectElement);

        this.lightSelectElement = document.createElement("canvas");
        this.lightSelectElement.width = 200;
        this.lightSelectElement.height = 200;
        this.lightSelectElement.addEventListener("click", e => this.selectSaturationLightness(e));
        this.lightSelectElement.classList.add("light");
        this.selectorEl.appendChild(this.lightSelectElement);

        this.resultElement = document.createElement("div");
        this.resultElement.addEventListener("click", e => this.selectColor());
        this.resultElement.classList.add("color-selection");
        this.selectorEl.appendChild(this.resultElement);
        
        this.hueContext = this.hueSelectElement.getContext("2d");
        this.lightContext = this.lightSelectElement.getContext("2d");
    }

    protected internalOpen(position: Point, ctxt: any): Promise<any> {
        const { value } = ctxt;
        this.color = rgbToHsv(value);
        this.draw();

        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        })
    }

    private selectColor() {
        super.close();
        this.resolve(hsvToRgb(this.color.h, this.color.s, this.color.v));
    }

    close() {
        super.close();
        this.reject();
    }

    private draw()  {

        this.resultElement.style.backgroundColor = rgb(hsvToRgb(this.color.h, this.color.s, this.color.v));

        const width = 200;
        const height = 200;
        for (let i = 0; i < width; ++i) {
            this.hueContext.fillStyle = rgb(hsvToRgb((360 * i) / width, 1, 1));
            this.hueContext.beginPath();
            this.hueContext.rect(i, 0, 1, 50);
            this.hueContext.fill();
        }

        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                this.lightContext.fillStyle = rgb(hsvToRgb(this.color.h, x / width, 1 - (y / height)));
                this.lightContext.beginPath();
                this.lightContext.rect(x, y, 1, 1);
                this.lightContext.fill();
            }
        }
    }

    private selectHue(ev) {
        const rect = ev.target.getBoundingClientRect();
        this.color = {...this.color, h: Math.min(360, Math.max(0, 360 * (ev.clientX - rect.left) / rect.width)) };
        this.draw();
    }

    private selectSaturationLightness(ev) {
        const rect = ev.target.getBoundingClientRect();
        this.color = {...this.color,
            s: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
            v: Math.min(1, Math.max(0, 1 - (ev.clientY - rect.top) / rect.height))
        };
        this.draw();
    }
}

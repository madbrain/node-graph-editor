import { PropertyHandler, Renderer, rgb, Corner, Direction, Align, StyleDimension } from "./renderer";
import { NodePropertyView } from "./views";
import { Event, Editor, State } from "./editor-api";
import { CommonValueType, ValueDefinition, Range } from "./value";
import { Point, Rectangle } from "./geometry";
import { PropertyType, NodeProperty, isOutput } from "./nodes";
import { IdleState } from "./states";
import { ChangePropertyValueCommand } from "./commands";
import { buildTreeFromEnums } from "./tree";

function isRangeFullyDefined(valueType: ValueDefinition) {
    return valueType.range && valueType.range.min != undefined && valueType.range.max != undefined;
}

function clampRange(range: Range, value: number) {
    if (range) {
        if (range.min != undefined) {
            value = Math.max(value, range.min);
        }
        if (range.max != undefined) {
            value = Math.min(value, range.max);
        }
    }
    return value;
}

function roundInt(type: string, value: number) {
    if (type == "integer") {
        value = Math.round(value);
    }
    return value;
}

function openValueEditor(editor: Editor, location: Point, property: NodeProperty, event: Event): State {
    const selectorResult = editor.openSelector(location, 'select-value', {
        value: property.value,
        valueType : property.definition.valueType
    });
    selectorResult.result.then(value => {
        editor.emit(new ChangePropertyValueCommand(property, value));
    }, () => {});
    return selectorResult.state;
}

class ChangeValueGesture extends State {
    private oldValue: number;

    constructor(private startEvent: Event, private bounds: Rectangle, private property: NodeProperty) {
        super();
        this.oldValue = property.value;
    }

    handleMouseUp(editor: Editor, event: Event) {
        const newValue = this.property.value;
        this.property.value = this.oldValue;
        if (this.oldValue != newValue) {
            editor.emit(new ChangePropertyValueCommand(this.property, newValue));
        }
        return new IdleState();
    }

    handleMouseMove(editor: Editor, event: Event): State {
        const valueType = this.property.definition.valueType;
        const range = valueType.range;
        const offset = (range.max - range.min) * (event.position.x - this.startEvent.position.x) / this.bounds.dimension.width;
        this.property.value = roundInt(valueType.type, clampRange(range, this.oldValue + offset));
        editor.draw();
        return this;
    }
}

class WaitChangeNumberGestureState extends State {

    constructor(private startEvent: Event, private property: NodePropertyView) {
        super();
    }

    handleMouseUp(editor: Editor, event: Event) {
        return openValueEditor(editor, this.property.globalBounds().bottomLeft(), this.property.property, event);
    }

    handleMouseMove(editor: Editor, event: Event): State {
        if (event.screenPosition.distance(this.startEvent.screenPosition) > 5) {
            return new ChangeValueGesture(this.startEvent, this.property.bounds, this.property.property);
        }
        return this;
    }
}

class DetectPlusMinusChangeNumberState extends State {
    private property: NodeProperty;
    private globalBounds: Rectangle;
    
    constructor(private prop: NodePropertyView) {
        super();
        this.property = prop.property;
        this.globalBounds = this.prop.globalBounds();
    }

    handleMouseUp(editor: Editor, event: Event) {
        const style = editor.renderer.style;
        const propBounds = this.globalBounds.shrink(style.unit * 2, 0);
        const minusRect = propBounds.origin.rect(style.unit * 3.5, propBounds.dimension.height);
        const plusRect = propBounds.topRight().offset(- style.unit * 3.5, 0).rect(style.unit * 3.5, propBounds.dimension.height);
        if (minusRect.contains(event.position)) {
            const newValue = clampRange(this.property.definition.valueType.range, this.property.value - 1);
            if (this.property.value != newValue) {
                editor.emit(new ChangePropertyValueCommand(this.property, newValue));
            }
        } else if (plusRect.contains(event.position)) {
            const newValue = clampRange(this.property.definition.valueType.range, this.property.value + 1);
            if (this.property.value != newValue) {
                editor.emit(new ChangePropertyValueCommand(this.property, newValue));
            }
        } else {
            return openValueEditor(editor, this.globalBounds.bottomLeft(), this.property, event);
        }
        return new IdleState();
    }
}

export const numberHandler: PropertyHandler = {

    handlerMouseDown(editor: Editor, event: Event, prop: NodePropertyView): State {
        const bounds = prop.globalBounds();
        const property = prop.property;
        const propBounds = bounds.shrink(editor.renderer.style.unit * 2, 0);
        if (propBounds.contains(event.position)) {
            if (isRangeFullyDefined(property.definition.valueType)) {
                return new WaitChangeNumberGestureState(event, prop);
            }
            return new DetectPlusMinusChangeNumberState(prop);
        }
        return new IdleState();
    },

    layout(renderer: Renderer, property: NodePropertyView) {
        const m = renderer.context.measureText(property.property.definition.label);
        property.bounds = new Point(0, 0).rect(m.width + renderer.style.unit * 3, renderer.style.unit * 4);
    },

    draw(renderer: Renderer, property: NodePropertyView) {
        const propBounds = property.globalBounds();
        const style = renderer.style;
        const box = propBounds.shrink(style.unit * 2, 0).withHeight(style.unit * 4);
        renderer.roundBox()
            .filled(rgb(renderer.theme.PROPERTY_COLOR))
            .draw(box);

        if (isRangeFullyDefined(property.property.definition.valueType)) {
            const range = property.property.definition.valueType.range;
            const proportion = (<number>(property.property.value) - range.min) / (range.max - range.min);
            renderer.roundBox()
                .filled(rgb(renderer.theme.HIGHLIGHT_COLOR))
                .clipped(box.withWidth(box.dimension.width * proportion))
                .draw(box);
        } else {
            renderer.drawArrow(propBounds.middleLeft().offset(style.unit * 3.5, 0), style.unit, Direction.LEFT, rgb(renderer.theme.TEXT_COLOR, 0.7));
            renderer.drawArrow(propBounds.middleRight().offset(- style.unit * 3.5, 0), style.unit, Direction.RIGHT, rgb(renderer.theme.TEXT_COLOR, 0.7));
        }
        renderer.drawText(propBounds.origin.offset(style.unit * 5, style.unit * 3), rgb(renderer.theme.TEXT_COLOR), property.property.definition.label + ":");
        const stringValue = (Math.round(property.getValue() * 100) / 100).toString();
        renderer.drawText(propBounds.topRight().offset(-style.unit * 5, style.unit * 3), rgb(renderer.theme.TEXT_COLOR), stringValue, Align.RIGHT);
    }
};

export const stringHandler: PropertyHandler = {

    handlerMouseDown(editor: Editor, event: Event, property: NodePropertyView): State {
        const propBounds = property.globalBounds().shrink(editor.renderer.style.unit * 2, 0);
        if (propBounds.contains(event.position)) {
            return openValueEditor(editor, property.globalBounds().bottomLeft(), property.property, event);
        }
        return new IdleState();
    },

    layout(renderer: Renderer, property: NodePropertyView) {
        const m = renderer.context.measureText(property.property.definition.label);
        property.bounds = new Point(0, 0).rect(m.width + renderer.style.unit * 3, renderer.style.unit * 4);
    },

    draw(renderer: Renderer, property: NodePropertyView) {
        const propBounds = property.globalBounds();
        const style = renderer.style;
        const box = propBounds.shrink(style.unit * 2, 0).withHeight(style.unit * 4);
        renderer.roundBox()
            .filled(rgb(renderer.theme.PROPERTY_COLOR))
            .draw(box);

        renderer.drawText(propBounds.origin.offset(style.unit * 5, style.unit * 3), rgb(renderer.theme.TEXT_COLOR), property.property.definition.label + ":");
        const value = property.getValue();
        const stringValue = value ? value.toString() : "";
        renderer.drawText(propBounds.topRight().offset(-style.unit * 5, style.unit * 3), rgb(renderer.theme.TEXT_COLOR), stringValue, Align.RIGHT);
    }
};

export const labelHandler = new class implements PropertyHandler {

    handlerMouseDown(editor: Editor, event: Event, property: NodePropertyView): State {
        const propBounds = property.globalBounds().shrink(editor.renderer.style.unit * 2, 0);
        if (propBounds.contains(event.position) && property.property.parent) {
            return openValueEditor(editor, property.globalBounds().bottomLeft(), property.property, event);
        }
        return new IdleState();
    }

    layout(renderer: Renderer, property: NodePropertyView) {
        const m = renderer.context.measureText(this.getText(property));
        property.bounds = new Point(0, 0).rect(m.width + renderer.style.unit * 3, renderer.style.unit * 4);
    }

    draw(renderer: Renderer, property: NodePropertyView) {
        const propBounds = property.globalBounds();
        const style = renderer.style;
        const stringValue = this.getText(property);
        if (isOutput(property.property.definition.type)) {
            renderer.drawText(propBounds.topRight().offset(- style.unit * 4, style.unit * 3), rgb(renderer.theme.TEXT_COLOR), stringValue, Align.RIGHT);
        } else {
            renderer.drawText(propBounds.origin.offset(style.unit * 3.5, style.unit * 3), rgb(renderer.theme.TEXT_COLOR), stringValue);
        }
    }

    getText(property: NodePropertyView) {
        const value = property.getValue();
        return property.property.parent && value ? value.toString() : property.property.definition.label;
    }
};

export const enumHandler: PropertyHandler = {
    
    handlerMouseDown(editor: Editor, event: Event, property: NodePropertyView): State {
        const selectorResult = editor.openSelector(property.globalBounds().bottomLeft(), 'select-tree', {
            nodes: buildTreeFromEnums(property.property.definition.valueType.enumValues)
        });
        selectorResult.result.then(value => {
            editor.emit(new ChangePropertyValueCommand(property.property, value.name));
        }, () => {});
        return selectorResult.state;
    },

    layout(renderer: Renderer, property: NodePropertyView) {
        const m = renderer.context.measureText(property.property.definition.label);
        property.bounds = new Point(0, 0).rect(m.width + renderer.style.unit * 3, renderer.style.unit * 4);
    },

    draw(renderer: Renderer, property: NodePropertyView) {
        const propBounds = property.globalBounds();
        const style = renderer.style;
        const value = property.getValue();
        const box = propBounds.shrink(style.unit * 2, 0).withHeight(style.unit * 4);
        renderer.roundBox()
            .filled(rgb(renderer.theme.SELECT_BACK_COLOR))
            .draw(box);

        const values = property.property.definition.valueType.enumValues.filter(enumValue => enumValue.name == <string>value);
        const valueLabel = values.length > 0 ? values[0].label : "";

        renderer.drawText(propBounds.origin.offset(style.unit * 3.5, style.unit * 3), rgb(renderer.theme.TEXT_COLOR), valueLabel);

        renderer.drawArrow(propBounds.middleRight().offset(-style.unit * 3.5, 0), style.unit, Direction.DOWN, rgb(renderer.theme.TEXT_COLOR, 0.7));
    }
};

class ToggleBooleanPropertyState extends State {
    constructor(private property: NodePropertyView) {
        super();
    }
    handleMouseUp(editor: Editor, event: Event): State {
        editor.emit(new ChangePropertyValueCommand(this.property.property, !this.property.property.value));
        return new IdleState();
    }
}

function checkboxRect(position: Point, style: StyleDimension) {
    return new Rectangle(position.x, position.y, style.unit * 3, style.unit * 3);
}

export const booleanHandler: PropertyHandler = {

    handlerMouseDown(editor: Editor, event: Event, property: NodePropertyView): State {
        const style = editor.renderer.style;
        const rect = checkboxRect(property.globalBounds().origin.offset(style.unit * 2, 0), style);
        if (rect.contains(event.position)) {
            return new ToggleBooleanPropertyState(property);
        }
        return new IdleState();
    },

    layout(renderer: Renderer, property: NodePropertyView) {
        const m = renderer.context.measureText(property.property.definition.label);
        property.bounds = new Point(0, 0).rect(m.width + renderer.style.unit * (2 + 3 + 1 + 2), renderer.style.unit * 4);
    },

    draw(renderer: Renderer, property: NodePropertyView) {
        const propBounds = property.globalBounds();
        const style = renderer.style;
        const checked = <boolean>(property.getValue());
        renderer.drawCheckBox(checkboxRect(propBounds.origin.offset(style.unit * 2, 0), style), checked)
        renderer.drawText(propBounds.origin.offset(style.unit * 6, style.unit * 2.5), rgb(renderer.theme.TEXT_COLOR), property.property.definition.label);
    }
};

export const defaultPropertyHandler: PropertyHandler = {
    
    handlerMouseDown(editor: Editor, event: Event, property: NodePropertyView): State {
        return new IdleState();
    },

    layout(renderer: Renderer, property: NodePropertyView) {
        const m = renderer.context.measureText(property.property.definition.label);
        property.bounds = new Point(0, 0).rect(m.width + renderer.style.unit * (3.5 + 2), renderer.style.unit * 4);
    },

    draw(renderer: Renderer, property: NodePropertyView) {
        const propBounds = property.globalBounds();
        const style = renderer.style;
        if (isOutput(property.property.definition.type)) {
            renderer.drawText(propBounds.topRight().offset(- style.unit * 4, style.unit * 3), rgb(renderer.theme.TEXT_COLOR), property.property.definition.label, Align.RIGHT);
        } else {
            renderer.drawText(propBounds.origin.offset(style.unit * 3.5, style.unit * 3), rgb(renderer.theme.TEXT_COLOR), property.property.definition.label);
        }
    }
}

export function getDefaultPropertyHandler(property: NodeProperty): PropertyHandler {
    if (property.definition.valueType.type == CommonValueType.INTEGER || property.definition.valueType.type == CommonValueType.REAL) {
        return numberHandler;
    }
    if (property.definition.valueType.type == CommonValueType.STRING) {
        return stringHandler;
    }
    if (property.definition.valueType.type == CommonValueType.ENUM) {
        return enumHandler;
    }
    if (property.definition.valueType.type == CommonValueType.BOOLEAN) {
        return booleanHandler;
    }
    if (property.definition.valueType.type == CommonValueType.LABEL) {
        return labelHandler;
    }
    return defaultPropertyHandler;
}
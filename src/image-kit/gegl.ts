
import { ChangePropertyValueCommand } from '../graph-editor/commands';
import { NodePropertyView } from '../graph-editor/views';
import { Editor, Event, State } from '../graph-editor/editor-api';
import { Node, NodeProperty } from '../graph-editor/nodes';
import { Point } from '../graph-editor/geometry';
import { getDefaultPropertyHandler } from '../graph-editor/handlers';
import { NodeDefinition, PropertyDefinition, PropertyType } from '../graph-editor/nodes';
import { Color, GraphicalHelper, PropertyHandler, Renderer, rgb } from '../graph-editor/renderer';
import { CommonValueType, ValueDefinition } from '../graph-editor/value';
import { convertColorFromString, convertColorToString } from './color';
import { gegl } from './gegl-nodes-db';

enum GeglValueType {
    COLOR = "color",
    IMAGE = "image",
}

const BOOL_DEF: ValueDefinition = { type: CommonValueType.BOOLEAN };
const REAL_DEF: ValueDefinition = { type: CommonValueType.REAL };
const INTEGER_DEF: ValueDefinition = { type: CommonValueType.INTEGER };
const STRING_DEF: ValueDefinition = { type: CommonValueType.STRING };
const IMAGE_DEF: ValueDefinition = { type: GeglValueType.IMAGE };
const COLOR_DEF: ValueDefinition = {
    type: GeglValueType.COLOR,
    converter: {
        deserialize: value => convertColorFromString(value),
        serialize: value => convertColorToString(value)
    }
};

function normalizeLabel(title: string, name: string) {
    if (title) {
        return title;
    }
    // TODO remove prefix before ':' split words on '-' and capitalize
    return name;
}

function buildPorts(ports, type: PropertyType): PropertyDefinition[] {
    const groups = {};
    ports.forEach(p => {
        const result = p.match(/^([^-]*)-[0-9]+$/);
        if (result) {
            let count = groups[result[1]] || 0
            groups[result[1]] = count + 1;
        } else {
            groups[p] = 1;
        }
    });
    function multipleType(t: PropertyType) {
        return t == PropertyType.INPUT ? PropertyType.NEW_INPUT : PropertyType.NEW_OUTPUT;
    }
    return Object.keys(groups).map(port => {
        return {
            type: groups[port] > 1 ? multipleType(type) : type,
            id: port,
            label: port,
            linkable: true,
            editable: false,
            valueType: IMAGE_DEF
        };
    });
}

function buildType(property): ValueDefinition {
    if (property.type == 'number') {
        if (property.range) {
            return {...REAL_DEF, range: { min: property.range.min, max: property.range.max }};
        }
        return REAL_DEF;
    }
    if (property.type == 'int') {
        if (property.range) {
            return {...INTEGER_DEF, range: { min: property.range.min, max: property.range.max }};
        }
        return INTEGER_DEF;
    }
    if (property.type == 'boolean') {
        return BOOL_DEF;
    }
    if (property.type == 'string') {
        return STRING_DEF;
    }
    if (property.type == 'enum') {
        return {
            type: CommonValueType.ENUM,
            enumValues: property.elements.map(element => {
                return { name: element.value, label: element.label };
            })
        }
    }
    if (property.type == 'color') {
        return COLOR_DEF;
    }
    return IMAGE_DEF;
}

function convertValue(valueType: ValueDefinition, value: any): any {
    if (value && valueType.converter) {
        return valueType.converter.deserialize(value);
    }
    return value;
}

function buildProperties(properties): PropertyDefinition[] {
    return properties.map(property => {
        const type = buildType(property);
        return {
            type: PropertyType.INPUT,
            id: property.id,
            label: normalizeLabel(property.nick, property.id),
            linkable: false,
            editable: true,
            valueType: type,
            defaultValue: convertValue(type, property.def)
        };
    });
}

function buildPreview(operation) {
    if (operation.name === "gegl:png-load"
            || operation.name === "gegl:png-save") {
        return true;
    }
    return undefined;
} 

function buildDefinitions(): NodeDefinition[] {
    return gegl.map(operation => {
        return ({
            id: operation.name,
            label: normalizeLabel(operation.title, operation.name),
            categories: operation.categories,
            properties: buildPorts(operation.inputs, PropertyType.INPUT)
                .concat(buildPorts(operation.outputs, PropertyType.OUTPUT))
                .concat(buildProperties(operation.properties)),
            preview: buildPreview(operation)
        });
    }).concat({
        id: "ratatest",
        label: "Rata Test",
        categories: "test",
        properties: [{
            type: PropertyType.NEW_OUTPUT,
            id: "output",
            label: "Output",
            linkable: true,
            editable: true,
            valueType: { type: CommonValueType.LABEL }
        }],
        preview: false
    });
}

const colorPropertyHandler: PropertyHandler = {
    handlerMouseDown(editor: Editor, event: Event, property: NodePropertyView): State {
        const selectorResult = editor.openSelector(property.globalBounds().bottomLeft(), 'select-color', {
            value: property.property.value,
        });
        selectorResult.result.then((value) => {
            editor.emit(new ChangePropertyValueCommand(property.property, value));
        }, () => {});
        return selectorResult.state;
    },

    layout(renderer: Renderer, property: NodePropertyView) {
        const m = renderer.context.measureText(property.property.definition.label);
        property.bounds = new Point(0, 0).rect(m.width + renderer.style.unit * (3.5 + 2*2 + 4), renderer.style.unit * 4);
    },

    draw(renderer: Renderer, property: NodePropertyView) {
        const propBounds = property.globalBounds();
        const style = renderer.style;
        renderer.drawText(propBounds.origin.offset(style.unit * 3.5, style.unit * 3),
            rgb(renderer.theme.TEXT_COLOR), property.property.definition.label);
        const colorRect = propBounds.topRight().offset(style.unit * -6, 0).rect(style.unit * 4, style.unit * 4);
        renderer.roundBox()
            .filled(rgb(property.property.value))
            .draw(colorRect);
    }
}

export const geglNodeDefinitions = buildDefinitions();

export class GeglGraphicalHelper implements GraphicalHelper {

    getHeaderColor(node: Node): Color {
        if (node.definition.categories && node.definition.categories.startsWith("programming:")) {
            return { r: 0xfc, g: 0x83, b: 0x47 }; // orange
        }
        if (node.definition.categories
                && (node.definition.categories === "hidden"
                    || node.definition.categories === "output")) {
            return {r: 0xaa, g: 0x26, b: 0x31 }; // dark red 
            // return { r: 0xcc, g: 0x29, b: 0x3e }; // red
        }
        if (node.definition.id == "gegl:add") {
            return {r: 0x75, g: 0x57, b: 0xb6 }; // purple
        }
        return { r: 0x00, g: 0xa9, b: 0x6a }; // green
    }
    
    getConnectorColor(property: NodeProperty): Color {
        const valueDef = property.definition.valueType;
        if (valueDef.type == GeglValueType.IMAGE) {
            return { r: 0xc7, g: 0xc7, b: 0x29 };
        }
        // if (valueDef.type == GeglValueType.UV) {
        //     return { r: 0x63, g: 0x63, b: 0xc7 };
        // }
        // if (valueDef.type == GeglValueType.SHADER) {
        //     return { r: 0x63, g: 0xc7, b: 0x63 };
        // }
        if (valueDef.type == CommonValueType.LABEL) {
            return { r: 0x63, g: 0xc7, b: 0x63 };
        }
        return { r: 0xa1, g: 0xa1, b: 0xa1 };
    }

    getPropertyHandler(property: NodeProperty) {
        if (property.definition.valueType.type == GeglValueType.COLOR) {
            return colorPropertyHandler;
        }
        return getDefaultPropertyHandler(property);
    }
}
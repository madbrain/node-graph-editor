import { Dimension, Point, Rectangle } from "./geometry";

describe("Point", () => {

    it("offset", () => {
        const point = new Point(10, 15).offset(20, 30);
        expect(point).toEqual(new Point(30, 45));
    });

    it("add", () => {
        const point = new Point(10, 15).add(new Point(20, 30));
        expect(point).toEqual(new Point(30, 45));
    });

    it("sub", () => {
        const point = new Point(40, 55).sub(new Point(20, 30));
        expect(point).toEqual(new Point(20, 25));
    });

    it("distance", () => {
        const dist = new Point(40, 55).distance(new Point(20, 30));
        expect(Math.floor(dist)).toEqual(32);
    });

    it("scale", () => {
        const point = new Point(40, 55).scale(5);
        expect(point).toEqual(new Point(200, 275));
    });

    it("min", () => {
        const point = new Point(40, 55).min(new Point(30, 75));
        expect(point).toEqual(new Point(30, 55));
    });

    it("max", () => {
        const point = new Point(40, 55).max(new Point(30, 75));
        expect(point).toEqual(new Point(40, 75));
    });

})

describe("Dimension", () => {

    it("scale", () => {
        const dimension = new Dimension(40, 55).scale(5);
        expect(dimension).toEqual(new Dimension(200, 275));
    });
    
})

describe("Rectangle", () => {

    it("build from point", () => {
        const rect = new Point(10, 15).rect(20, 30);
        expect(rect).toEqual(new Rectangle(10, 15, 20, 30));
    });

    it("build from point and dimension", () => {
        const rect = new Point(10, 15).rectOf(new Dimension(20, 30));
        expect(rect).toEqual(new Rectangle(10, 15, 20, 30));
    });

    it("build centered around point", () => {
        const rect = new Point(10, 20).rectCentered(10, 10);
        expect(rect).toEqual(new Rectangle(5, 15, 10, 10));
    });

    it("build from two points", () => {
        const rect = new Point(10, 20).rectTo(new Point(30, 40));
        expect(rect).toEqual(new Rectangle(10, 20, 20, 20));
    });

    it("get corner", () => {
        const point = new Rectangle(10, 20, 30, 40).corner();
        expect(point).toEqual(new Point(40, 60));
    });

    it("get topRight", () => {
        const point = new Rectangle(10, 20, 30, 40).topRight();
        expect(point).toEqual(new Point(40, 20));
    });

    it("get bottomLeft", () => {
        const point = new Rectangle(10, 20, 30, 40).bottomLeft();
        expect(point).toEqual(new Point(10, 60));
    });

    it("get middleRight", () => {
        const point = new Rectangle(10, 20, 30, 40).middleRight();
        expect(point).toEqual(new Point(40, 30));
    });

    it("get middleLeft", () => {
        const point = new Rectangle(10, 20, 30, 40).middleLeft();
        expect(point).toEqual(new Point(10, 30));
    });

    it("get middleTop", () => {
        const point = new Rectangle(10, 20, 30, 40).middleTop();
        expect(point).toEqual(new Point(20, 20));
    });

    it("get middleBottom", () => {
        const point = new Rectangle(10, 20, 30, 40).middleBottom();
        expect(point).toEqual(new Point(20, 60));
    });

    it("expand", () => {
        const rect = new Rectangle(10, 20, 30, 40).expand(5, 10);
        expect(rect).toEqual(new Rectangle(5, 10, 40, 60));
    });

    it("shrink", () => {
        const rect = new Rectangle(10, 20, 30, 40).shrink(5, 10);
        expect(rect).toEqual(new Rectangle(15, 30, 20, 20));
    });

    it("withSize", () => {
        const rect = new Rectangle(10, 20, 30, 40).withSize(new Dimension(5, 10));
        expect(rect).toEqual(new Rectangle(10, 20, 5, 10));
    });

    it("withWidth", () => {
        const rect = new Rectangle(10, 20, 30, 40).withWidth(10);
        expect(rect).toEqual(new Rectangle(10, 20, 10, 40));
    });

    it("withHeight", () => {
        const rect = new Rectangle(10, 20, 30, 40).withHeight(10);
        expect(rect).toEqual(new Rectangle(10, 20, 30, 10));
    });

    it("moveOrigin", () => {
        const rect = new Rectangle(10, 20, 30, 40).moveOrigin(10, 10);
        expect(rect).toEqual(new Rectangle(20, 30, 20, 30));
    });

    it("move", () => {
        const rect = new Rectangle(10, 20, 30, 40).move(new Point(10, 10));
        expect(rect).toEqual(new Rectangle(20, 30, 30, 40));
    });

    it("moveTo", () => {
        const rect = new Rectangle(10, 20, 30, 40).moveTo(new Point(10, 10));
        expect(rect).toEqual(new Rectangle(10, 10, 30, 40));
    });

    it("contains", () => {
        const value = new Rectangle(10, 20, 30, 40).contains(new Point(15, 25));
        expect(value).toBeTruthy();
    });

    it("containsRect", () => {
        const value = new Rectangle(10, 20, 30, 40).containsRect(new Rectangle(15, 25, 5, 5));
        expect(value).toBeTruthy();
    });

    it("union", () => {
        const rect = new Rectangle(10, 20, 30, 40).union(new Rectangle(15, 25, 40, 5));
        expect(rect).toEqual(new Rectangle(10, 20, 45, 40));
    });

});
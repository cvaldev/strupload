import router from "../../src/server/routes/auth";
import express from "express";
import request from "supertest";
import passport from "passport";

const app = express();
app.use(router);
afterEach(jest.restoreAllMocks);

describe("/", () => {
    test("GET / starts oauth flow", async () => {
        const response = await request(app).get("/");
        expect(response.status).toBe(302);
    });

    test("Can GET / to login", async () => {
        const spy = jest.spyOn(passport, "authenticate");
        await request(app).get("/");
        expect(spy).toHaveBeenCalled();
    });
});

describe("/redirect", () => {
    test("Redirects to home if succesful auth", async () => {
        jest.spyOn(
            passport,
            "authenticate"
        ).mockImplementation(() => (req, res, next) => next());

        const response = await request(app).get(`/redirect`);

        expect(response.status).toBe(302);
        expect(response.header.location).toBe("/");
    });

    test("Restarts oauth flow if not authenticated", async () => {
        const spy = jest.spyOn(passport, "authenticate");
        const response = await request(app).get(`/redirect`);

        expect(spy.mock.calls[0][1]).toHaveProperty("failureRedirect");
        expect(response.status).toBe(302);
    });
});

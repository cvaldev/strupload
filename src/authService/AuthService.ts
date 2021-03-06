import passport from "passport";
import refresh from "passport-oauth2-refresh";
import * as db from "../server/models";
import { sign, verify } from "jsonwebtoken";
import { Handler, Request, Response, NextFunction } from "express";
import { IUser } from "../interfaces";
import { Logger } from "log4js";
import { logger } from "../logger";

/**
 * AuthService defines the needed functions to authenticate and verify a user.
 */
export default class AuthService {
    private _name: string;
    private _middleware: Handler[];
    private _scope: string;
    private _loginRoute: string;
    private _secret: string;
    private logger: Logger;

    public constructor(
        name: string,
        scope: string,
        loginRoute: string,
        secret: string,
        middleware: Handler[]
    ) {
        this._name = name;
        this._middleware = middleware;
        this._scope = scope;
        this._loginRoute = loginRoute;
        this._secret = secret;
        this.logger = logger;
    }

    // Express middleware
    public get middleware(): Handler[] {
        return this._middleware;
    }
    public get name(): string {
        return this._name;
    }
    public get scope(): string {
        return this._scope;
    }

    // Decides what happens after the user authenticates for the first time.
    public handleRedirect = (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
        const { state, scope } = req.query;
        const requiredScope = "read," + this._scope;
        if (req.user) {
            // Extract user id from req.user
            const { id } = <IUser>req.user;
            if (scope !== requiredScope) {
                this.logger.debug(`${id} scope : ${scope}`);
            }

            if (state === "tokenize") {
                // Create a jwt and send it back in the response.
                const token = this.getJwt(id);
                return res.json({ token: token });
            }
        }
        return next();
    };

    // Makes sure the user's tokens stay updated in our db.
    public refreshToken = async (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const user = await this.updateAccessToken(<IUser>req.user);
            req.user = user;
            return next();
        } catch (err) {
            this.logger.error(err);
            return res.status(err.statusCode).json(err);
        }
    };

    // Returns either the updated user or user if token is still valid.
    // Gets a new token for user and updates the database.
    public updateAccessToken = (user: IUser) => {
        return new Promise((resolve, reject) => {
            refresh.requestNewAccessToken(
                this._name,
                user.refreshToken,
                async (err, accessToken, refreshToken) => {
                    this.logger.debug(`${user.id} refreshing `);
                    if (err || !accessToken) {
                        reject(err ?? "ERROR");
                    } else if (
                        user.accessToken !== accessToken ||
                        user.refreshToken !== refreshToken
                    ) {
                        await db.update(user, accessToken, refreshToken);
                        resolve(db.find(user.id));
                        this.logger.debug(`${user.id} updated`);
                    }
                    resolve(user);
                }
            );
        });
    };

    // Ensure the user is authorized to use this route
    public ensureAuthorized = (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
        // Select authentication type.
        const { authorization } = req.headers;
        if (authorization) {
            // Use token
            return this.verifyToken(req, res, next);
        } else {
            // Use session
            return this.ensureLogin(req, res, next);
        }
    };

    // Ensures the user is logged in.
    public ensureLogin = (req: Request, res: Response, next: NextFunction) => {
        if (req.isAuthenticated()) {
            //@ts-ignore
            this.logger.debug(`Authenticated ${req.user.id}!`);
            return next();
        }
        return res.redirect(this._loginRoute);
    };

    // Verify the jwt
    public verifyToken = async (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
        const { authorization } = req.headers;
        if (authorization) {
            const [type, token] = authorization.split(" ");
            try {
                this.logger.debug(`Verifying token: ${token}`);

                const data = verify(token, this._secret);
                // @ts-ignore: id doesn't exist
                const user = await db.find(data.id);
                if (user) {
                    // Load the user in the request and move on.
                    req.user = user;
                    return next();
                }
            } catch (err) {
                this.logger.error(err);
                return res.status(403).send(err);
            }
        }
        // Deny entry if bad token or no user in db.
        return res.sendStatus(403);
    };

    // Create a jwt
    public getJwt = (id: number) => {
        return sign({ id: id }, this._secret);
    };

    // Use the passport to authenticate a user.
    public authenticate = (...args: any): any => {
        return passport.authenticate(this._name, ...args);
    };

    // Initial login with the required scopes and state.
    public login = (state?: string, force?: boolean): any => {
        const { _scope: scope } = this;
        if (force) {
            this.logger.debug("Force approval_prompt");
            return this.authenticate({
                scope: scope,
                approval_prompt: "force"
            });
        }

        return this.authenticate({ scope: scope, state: state });
    };

    // Check if authentication was accepted by user during first redirect.
    public verifyRedirect = (
        req: Request,
        res: Response,
        next: NextFunction
    ): any => {
        return this.authenticate({ failureRedirect: this._loginRoute })(
            req,
            res,
            next
        );
    };
}

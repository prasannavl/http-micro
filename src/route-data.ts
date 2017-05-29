import { IRouteDescriptor, RouteDefinition } from "./router";
import { Context } from "./context";

export class RouteData {
    private _matches: RegExpMatchArray[] = null;
    routes: RouteDefinition<any>[] = [];
    descriptors: IRouteDescriptor<any>[] = [];
    params: any = null;

    add(route: any, descriptor: any, match: RegExpMatchArray, params: any) {
        if (!this._matches) this._matches = [];
        this._matches.push(match);
        this.descriptors.push(descriptor);
        this.routes.push(route);
        this.params = this.params || {};
        Object.assign(this.params, params);
    }

    getMatch(): RegExpMatchArray {
        return this._matches ? this._matches[0] : null;
    }

    getMatches() {
        return this._matches;
    }
}
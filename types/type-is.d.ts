declare module "type-is" {
    import * as http from "http";

    namespace TypeIs {
        function hasBody(request: http.IncomingMessage): boolean;
        function is(mediaType: string, mediaTypes: Array<string>): string;
    }

    function TypeIs(request: http.IncomingMessage, types: Array<string>): any;
    export = TypeIs;
}
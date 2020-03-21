import * as db from "./src/models/models";
import { configuration } from "./src/configuration/configuration";
import app from "./app";

const PORT = process.env.PORT || 8080;
(async () => {
    try {
        await db.init();

        app.listen(PORT, () => console.log(`Server Listening on ${PORT}`));
    } catch (e) {
        console.log(e);
    }
})();

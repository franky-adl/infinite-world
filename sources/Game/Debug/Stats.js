import StatsJs from "stats.js";

export default class Stats {
    constructor() {
        this.instance = new StatsJs();
        this.instance.showPanel(0);

        document.body.appendChild(this.instance.dom);
    }

    update() {
        this.instance.update();
    }

    destroy() {
        document.body.removeChild(this.instance.dom);
    }
}

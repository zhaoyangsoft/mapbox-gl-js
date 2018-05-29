
import Benchmark from '../lib/benchmark';
import createMap from '../lib/create_map';

const width = 1024;
const height = 768;
const zooms = [4, 8, 11, 13, 15, 17];

export default class Paint extends Benchmark {
    setup() {
        return Promise.all(zooms.map(zoom => {
            return createMap({
                zoom,
                width,
                height,
                center: [2.34793, 48.85602],
                style: this.styleURL,
                fadeDuration: 0
            });
        })).then(maps => {
            this.maps = maps;
        });
    }

    bench() {
        for (const map of this.maps) {
            map._styleDirty = true;
            map._sourcesDirty = true;
            map._render();
        }
        // for (const map of this.maps) {
        //     // Block until all GL commands have finished so that
        //     // time spent in the GPU isn't split across bench runs
        //     map.painter.context.gl.finish();
        //     // Hack to force collision detection to happen on every frame
        //     map.style.placement.commitTime = 0;
        // }
    }

    teardown() {
        for (const map of this.maps) {
            map.remove();
        }
    }
}

// @flow

import Benchmark from '../lib/benchmark';

import createStyle from '../lib/create_style';
import VT from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import assert from 'assert';
import promisify from 'pify';
import WorkerTile from '../../src/source/worker_tile';
import StyleLayerIndex from '../../src/style/style_layer_index';
import deref from '../../src/style-spec/deref';
import { OverscaledTileID } from '../../src/source/tile_id';
import { normalizeStyleURL, normalizeSourceURL, normalizeTileURL } from '../../src/util/mapbox';

import type {TileJSON} from '../../src/types/tilejson';

// Note: this class is extended in turn by the LayoutDDS benchmark.
export default class Layout extends Benchmark {
    glyphs: Object;
    icons: Object;
    workerTile: WorkerTile;
    layerIndex: StyleLayerIndex;
    tiles: Array<{tileID: OverscaledTileID, buffer: ArrayBuffer}>;

    tileIDs(): Array<OverscaledTileID> {
        return [
            //new OverscaledTileID(16, 0, 16, 33195, 22545)
            //new OverscaledTileID(15, 0, 15, 29105, 12902)
            new OverscaledTileID(12, 0, 12, 2074, 1409)
            // new OverscaledTileID(8, 0, 8, 129, 88),
            // new OverscaledTileID(4, 0, 4, 8, 5),
            // new OverscaledTileID(0, 0, 0, 0, 0)
        ];
    }

    sourceID(): string {
        return 'composite';
    }

    fetchStyle(): Promise<StyleSpecification> {
        return fetch(normalizeStyleURL(this.styleURL))
            .then(response => response.json());
    }

    fetchTiles(styleJSON: StyleSpecification): Promise<Array<{tileID: OverscaledTileID, buffer: ArrayBuffer}>> {
        const sourceURL: string = (styleJSON.sources[this.sourceID()]: any).url;
        return fetch(normalizeSourceURL(sourceURL))
            .then(response => response.json())
            .then((tileJSON: TileJSON) => {
                return Promise.all(this.tileIDs().map(tileID => {
                    return fetch((normalizeTileURL(tileID.canonical.url(tileJSON.tiles))))
                        .then(response => response.arrayBuffer())
                        .then(buffer => ({tileID, buffer}));
                }));
            });
    }

    setup(): Promise<void> {
        return this.fetchStyle()
            .then((styleJSON) => {
                this.layerIndex = new StyleLayerIndex(deref(styleJSON.layers));
                return Promise.all([createStyle(styleJSON), this.fetchTiles(styleJSON)]);
            })
            .then(([style, tiles]) => {
                this.tiles = tiles;
                this.glyphs = {};
                this.icons = {};

                const preloadGlyphs = (params, callback) => {
                    style.getGlyphs('', params, (err, glyphs) => {
                        this.glyphs[JSON.stringify(params)] = glyphs;
                        callback(err, glyphs);
                    });
                };

                const preloadImages = (params, callback) => {
                    style.getImages('', params, (err, icons) => {
                        this.icons[JSON.stringify(params)] = icons;
                        callback(err, icons);
                    });
                };

                return this.bench(preloadGlyphs, preloadImages);
            });
    }

    bench(getGlyphs: Function = (params, callback) => callback(null, this.glyphs[JSON.stringify(params)]),
          getImages: Function = (params, callback) => callback(null, this.icons[JSON.stringify(params)])) {

        const actor = {
            send(action, params, callback) {
                setTimeout(() => {
                    if (action === 'getImages') {
                        getImages(params, callback);
                    } else if (action === 'getGlyphs') {
                        getGlyphs(params, callback);
                    } else assert(false);
                }, 0);
            }
        };

        let promise: Promise<void> = Promise.resolve();

        for (const {tileID, buffer} of this.tiles) {
            promise = promise.then(() => {
                const workerTile = new WorkerTile({
                    tileID: tileID,
                    zoom: tileID.overscaledZ,
                    tileSize: 512,
                    overscaling: 1,
                    showCollisionBoxes: false,
                    source: this.sourceID(),
                    uid: '0',
                    maxZoom: 22,
                    pixelRatio: 1,
                    request: {
                        url: ''
                    },
                    angle: 0,
                    pitch: 0,
                    cameraToCenterDistance: 0,
                    cameraToTileDistance: 0
                });

                const tile = new VT.VectorTile(new Protobuf(buffer));
                const parse = promisify(workerTile.parse.bind(workerTile));

                return parse(tile, this.layerIndex, actor);
            });
        }

        return promise;
    }
}

const fs = require('fs-extra');
const fsinfo = require("../fsinfo");

const io = require('blacksocket.io/server')(23334, {
    path: '/test',
    serveClient: false,
});
const common = require('../common');
const Path = require('path');
const rimraf = require('rimraf');

const targetFolder = Path.join(__dirname, '..', '..', 'target');
console.log('targetFolder', targetFolder);
function testPath(path) {
    return /\.(\/|$)/.test(path);
}
io.on('connection', (socket) => {
    console.log('socket connection');
    socket.on('get-file-list', (params, cb) => {
        fsinfo(targetFolder).then((list) => {
            cb(list);
        });
    });
    socket.on('delete', (params) => {
        console.log('ondelete', params)
        if (common.islegalPath(params)) {
            console.warn('invalid path', params);
            return;
        }
        const target = Path.join(targetFolder, params);
        console.log('delete target', target);
        rimraf(target, () => { });
    });
    socket.on('copy', async ({ path, data }, cb) => {
        if (common.islegalPath(path)) {
            console.warn('invalid path', path);
            return;
        }
        path = Path.join(targetFolder, path);
        await fs.ensureDir(Path.parse(path).dir);
        await fs.writeFile(path, data);
        cb();
    });
    socket.on('fetch', async (path, cb) => {
        if (common.islegalPath(path)) {
            console.warn('invalid path', path);
            return;
        }
        path = Path.join(targetFolder, path);
        const list = await fsinfo(path, { read: true });
        list.forEach((file) => {
            file.path = Path.join('/', Path.relative(targetFolder, path), file.path.slice(1));
        });
        // console.log('targetFolder', Path.relative(targetFolder, path))
        console.log(list);
        cb(list);

        // mkdirp(Path.parse(path).dir, () => {
        //     fs.writeFile(path, data, (err) => {
        //         if (err) {
        //             return console.log(err);
        //         }
        //         cb();
        //     });
        // });
    });
});

const path = require('path');
const fs = require('fs');

module.exports = function (targetPath, handler) {
    const rootPath = targetPath;

    return new Promise((resolve) => {
        fs.readdir(targetPath, (err, files) => {
            handler({
                path: '/',
                filename: '/',
                directory: true,
                files,
            });
            traverseFolder({ path: '', files }, targetPath, handler, rootPath).then((result) => {
                resolve(result);
            });
        });
    });
};
function traverseFolder(folder, targetPath, handler, rootPath) {
    return new Promise((resolve, reject) => {
        const folders = [];
        const finalPath = path.join(targetPath, folder.path);
        // console.log('finalPath', finalPath);
        fs.readdir(finalPath, (err, files) => {
            if (err) {
                reject(err);
            }
            const filePromise = files.map(filename => new Promise((resolveFile) => {
                const filePath = path.join(folder.path, filename);
                const fullPath = path.join(targetPath, filePath);

                fs.stat(fullPath, (errStat, stat) => {
                    if (errStat) {
                        reject(errStat);
                    }
                    const directory = stat.isDirectory();
                    new Promise(((resolve) => {
                        if (directory) {
                            fs.readdir(fullPath, (err, files) => {
                                if (err) {
                                    reject(err);
                                }
                                folders.push({ path: filePath, files });
                                resolve(files);
                            });
                        } else {
                            resolve();
                        }
                    })).then((files) => {
                        // console.log('fullPath', fullPath);
                        const params = {
                            path: `/${path.relative(rootPath, fullPath)}`,
                            filename,
                            directory,
                        };
                        if (files) {
                            params.files = files;
                        }
                        if (handler) {
                            handler(params);
                        }
                        resolveFile();
                    });
                });
            }));
            Promise.all(filePromise)
                .then(() => Promise.all(folders.map(folder => traverseFolder(folder, targetPath, handler, rootPath))))
                .then(resolve);
        });
    });
}

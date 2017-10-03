const path = require('path');
const fs = require('fs');

module.exports = traverseFolder.bind(undefined, '');
function traverseFolder(folderPath, targetPath, handler) {
    return new Promise((resolve, reject) => {
        const folders = [];
        fs.readdir(path.join(targetPath, folderPath), (err, files) => {
            if (err) {
                reject(err);
            }
            const filePromise = files.map(filename => new Promise((resolveFile) => {
                const filePath = path.join(folderPath, filename);
                const fullPath = path.join(targetPath, filePath);

                fs.stat(fullPath, (errStat, stat) => {
                    if (errStat) {
                        reject(errStat);
                    }
                    const directory = stat.isDirectory();
                    if (directory) {
                        folders.push(filePath);
                    }

                    const params = {
                        fullPath,
                        filename,
                        directory,
                    };
                    if (handler) {
                        handler(params);
                    }
                    resolveFile();
                });
            }));
            Promise.all(filePromise)
                .then(() => Promise.all(folders.map(folder => traverseFolder(folder, targetPath, handler))))
                .then(resolve);
        });
    });
}

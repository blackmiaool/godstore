function islegalPath(pathname) {
    return !pathname.includes('..');
    // return /\.(\/|$)/.test(pathname);
}
module.exports = {
    islegalPath
};


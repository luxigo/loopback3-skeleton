'use strict';
module.exports = function () {
    var path=require('path');
    return function urlNotFoundError(req, res, next) {
        if (req.headers.accept && req.headers.accept.match(/html/)) {
          res.sendFile(path.join(__dirname,'404.html'), function (err) {
              if (err) {
                  console.error(err);
                  res.status(404).end();
              }
          });

        } else {
          res.status(404).end();
          return;
        }
    };
};

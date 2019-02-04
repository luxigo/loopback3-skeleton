'use strict';

var path=require('path');
module.exports = function(app) {
  var router = app.loopback.Router();
  var index=path.resolve(
    __dirname,
    '..',
    '..',
    'client',
    (app.get('production')&&!req.cookies.debug)?'dist':'app',
    'index.html'
  );

  router.get('/', function(req,res,next){
    res.sendFile(index, function(err){
      if(err) {
        next(err);
        return;
      }
    });

  });
  app.use(router);
};

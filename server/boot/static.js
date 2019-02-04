'use strict';

module.exports = function(app) {
  var path=require('path');
  var loopback=require('loopback');

  app.use(function(req,res,next){
    var staticServe=loopback.static(
      path.resolve(
        __dirname,
       '..',
       '..',
       'client',
       (app.get('production')&&!req.cookies.debug)?'dist':'app'
      )
    );

    return staticServe(req,res,next);
  });

};

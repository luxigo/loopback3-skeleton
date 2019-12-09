'use strict';

module.exports = function(app) {
  app.models.user.upsertList(app.get('users'));
};

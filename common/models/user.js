/*
 * user.js
 *
 * Copyright (c) 2015-2018 ALSENET SA - http://doxel.org
 * Please read <http://doxel.org/license> for more information.
 *
 * Author(s):
 *
 *      Luc Deschenaux <luc.deschenaux@freesurf.ch>
 *
 * This file is part of the DOXEL project <http://doxel.org>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Additional Terms:
 *
 *      You are required to preserve legal notices and author attributions in
 *      that material or in the Appropriate Legal Notices displayed by works
 *      containing it.
 *
 *      You are required to attribute the work as explained in the "Usage and
 *      Attribution" section of <http://doxel.org/license>.
 */

/* eslint "max-len": "off", "comma-dangle": "off" */
'use strict';

module.exports = function(User) {

  var extend = require('extend');
  var Q = require('q');
//  var ObjectID = require('mongodb').ObjectID;

  User.prototype.getRoles = function(){
    var user = this;
    var RoleMapping = User.app.models.roleMapping;

    return Q(RoleMapping.find({
      where: {
        principalType: RoleMapping.USER,
        principalId: user.id.toString(),
      },
    }))
    .then(function(mappings){
      console.log('mappings', mappings);
      if (!mappings) {
        return Q.resolve([]);
      }
      var result = [];
      mappings.forEach(function(mapping){
        result.push(mapping.roleId);
      });
      return Q.resolve(result);
    })
    .fail(console.log);
  };

  User.prototype.getRoleNames = function(){
    var user = this;
    var RoleMapping = User.app.models.roleMapping;

    return Q(RoleMapping.find({
      where: {
        principalType: RoleMapping.USER,
        principalId: user.id,
      },
      include: 'role',
    }))
    .then(function(mappings){
      console.log('mappings', mappings);
      if (!mappings) {
        return Q.resolve([]);
      }
      var result = [];
      mappings.forEach(function(mapping){
        result.push(mapping.role().name);
      });
      return Q.resolve(result);

    })
    .fail(console.log);
  };

  /**
  * @method User.authenticate
  * @param args {Object}
  * @param args.access_token {String} access token to validate
  * @return defer {Promise}
  * @resolve args {Object} same as input
  * @resolve args.accessToken {Object} the accessToken instance
  */
  User.authenticate = function authenticate(args) {
    var q = Q.defer();

    if (!args.access_token) {
      q.reject(new Error('authentication failed'));
      return q.promise;
    }

    // authenticate user using args.access_token
    // and fetch user info
    User.relations.accessTokens.modelTo.findById(
      args.access_token, {
        include: {
          relation: 'user',
        },

      }, function(err, accessToken) {
        if (err) {
          args.accessToken = null;
          q.reject(err);

        } else {
          if (!accessToken) {
            q.reject(new Error('Access token expired. ' + args.access_token));

          } else {
            accessToken.validate(function(err, isValid){
              if (err) {
                q.reject(err);

              } else if (!isValid) {
                q.reject(new Error('Access token expired ' + args.access_token));

              } else {
                args.accessToken = accessToken;
                q.resolve(args);

              }
            });
          }
        }
      }
    );
    return q.promise;

  }; // authenticate

  // send password reset link when password reset requested
  User.on('resetPasswordRequest', function(info) {
    var app = User.app;
    var url = [
      'http',
      (app.get('httpOnly') ? '' : 's'),
      '://',
      app.get('host'),
      (app.get('reverseProxy') ? '' : ':' + app.get('port')),
      '/reset-password-form'
    ].join('');

    var html = 'Click <a href="' + url + '/' + info.accessToken.id + '">here</a> to reset your password.';

    app.models.Email.send({
      to: info.email,
      from: info.email,
      subject: 'Password change request',
      html: html
    }, function(err) {
      if (err) {
        return console.log('> error sending password reset email');
      }
      console.log('> sending password reset email to:', info.email);
    });
  });

  User.signin = function user_signin(options, req, callback) {
    console.log('options', JSON.stringify(options));

    // need at least username or email
    if (!options.email) {
      if (!options.username) {
        callback(null, {error: 'noUsername'});
        return;
      }
    }

    // and password
    if (!options.password) {
      callback(null, {error: 'noPassword'});
      return;
    }

    var accessToken;
    Q(User.login({
      username: options.username,
      email: options.email,
      password: options.password,

    })).then(function(_accessToken){
      accessToken = _accessToken;
      return Q(User.findById(accessToken.userId, {
        include: 'roles',
      }));
    })
    .then(function(user){
      console.log(user);
      callback(null, {session: accessToken, user: user});

    }).fail(function(err){
      console.log('login failed: ' + JSON.stringify(options));
      console.log(err.stack, err.message);
      callback(null, {error: 'loginFailed'});

    }).done();

  }; // User.signin

  User.remoteMethod(
    'signin',
    {
      accepts: [
        {arg: 'options', type: 'object', http: {source: 'body'}},
        {arg: 'req', type: 'object', http: {source: 'req'}},
      ],
      returns: {arg: 'result', type: 'object'},
    }
  );

  User.signout = function(options, req, callback){

    function failed(err){
      console.log(err.stack, err.message);
      callback(null, {error: 'logoutFailed'});
    }

    req.access_token = req.headers.authorization || (req.accessToken && req.accessToken.id);
    User.authenticate(req)
    .then(function(req){
      if (options.removeAllAccessTokens) {
        if (req.accessToken && req.accessToken.userId) {
          User.app.models.AccessToken.destroyAll({
            userId: req.accessToken.userId,
          }, function(err){
            if (err) {
              return failed(err);
            }
            callback();
          });

        } else {
          callback();
        }

      } else {
        req.accessToken.destroy(function(err){
          if (err) {
            return failed(err);
          }
          callback();
        });
      }
    })
    .fail(failed)
    .done();

  }; // User.signout

  User.remoteMethod(
    'signout',
    {
      accepts: [
        {arg: 'options', type: 'object', http: {source: 'body'}},
        {arg: 'req', type: 'object', http: {source: 'req'}},
      ],
      returns: {arg: 'result', type: 'object'},
    }
  );

  User.changePassword = function(options, req, callback) {
    User.authenticate({
      access_token: req.headers.authorization,

    }).then(function(args){
      var user = args.accessToken.user();
      user.updateAttribute('password', options.password, function(err, user) {
        if (err) {
          console.log('changePassword:', err.message, err.stack);
          return callback(null, {error: 'tokenExpired'});
        }
        console.log('password changed for ' + req.accessToken.userId);
        callback(null, {success: true});
      });

    }).fail(function(err){
      console.log('changePassword:', err.message, err.stack);
      callback(null, {error: 'tokenExpired'});
    }).done();

  };

  User.remoteMethod(
      'changePassword',
    {
      accepts: [
              {arg: 'options', type: 'object', http: {source: 'body'}},
              {arg: 'req', type: 'object', http: {source: 'req'}},
      ],
      returns: { arg: 'result', type: 'object' },
    }
  );

  User.grantRole = function(options, callback) {
    var username = options.username;
    var roleName = options.roleName;
    var user = this;
    var Role = User.app.models.role;
    var RoleMapping = User.app.models.roleMapping;
    var role;

    Q(Role.findOne({
      where: {
        name: roleName,
      },
    }))
    .then(function(_role) {
      role = _role;
      console.log(arguments);
      if (!role || !role.id) {
        return Q.reject(new Error('no such role: ' + roleName));
      }
      return Q(user.findOne({
        where: {
          username: username,
        },
        fields: {
          id: true,
        },
      }));
    })
    .then(function(user) {
      if (!user || !user.id) {
        return Q.reject(new Error('no such user: ' + username));
      }
      return Q(RoleMapping.findOrCreate({
        principalType: 'USER',
        principalId: user.id,
        roleId: role.id,
      }));
    })
    .then(function(roleMapping){
      console.log('User ' + username + ' added to role ' + roleName);
      callback(null, {roleMapping: roleMapping && roleMapping[0]});
    })
    .catch(callback)
    .done();

  };

  User.remoteMethod(
    'grantRole',
    {
      accepts: [
          {arg: 'options', type: 'object', http: {source: 'body'}},
      ],
      returns: { arg: 'result', type: 'object' },
    }
  );

  User.revokeRole = function(options, callback) {
    var username = options.username;
    var roleName = options.roleName;
    var user = this;
    var Role = User.app.models.role;
    var RoleMapping = User.app.models.roleMapping;
    var role;

    Q(Role.findOne({
      where: {
        name: roleName,
      },
      fields: {
        id: true,
      },
    }))
    .then(function(_role) {
      role = _role;
      if (!role || !role.id) {
        return Q.reject(new Error('no such role: ' + roleName));
      }
      return Q(user.findOne({
        where: {
          username: username,
        },
        fields: {
          id: true,
        },
      }));
    })
    .then(function(user) {
      if (!user || !user.id) {
        return Q.reject(new Error('no such user: ' + username));
      }
      return Q(RoleMapping.destroyAll({
        principalType: 'USER',
        principalId: user.id,
        roleId: role.id,
      }));
    })
    .then(function(result){
      console.log('Revoked role ' + roleName + ' for user ' + username);
      callback(null, {result: result});
    })
    .catch(callback)
    .done();

  };

  User.remoteMethod(
    'revokeRole',
    {
      accepts: [
        {arg: 'options', type: 'object', http: {source: 'body'}},
      ],
      returns: { arg: 'result', type: 'object' },
    }
  );

  User.upsertList = function(list, debug) {
    var app = this.app;
    var Role = app.models.role;
    var User = app.models.user;
    var RoleMapping = app.models.roleMapping;
    var created_role = {};

    return list.reduce(function(promise, item){
      var user_roles = item.roles;
      var forceUpdate = item.forceUpdate;
      var _user = item.user;

      return promise.then(function(){
        if (debug) console.log(_user);

        // check for existing user
        return Q(User.count({
          username: _user.username,
        }));
      })
      .then(function(count){
        if (count && !forceUpdate) {
          // skip as requested
          if (debug) console.log('forceUpdate is not set, skipping user: ' + _user.username);
          return;
        }

        // create user's roles
        return user_roles.reduce(function(promise, _role){
          if (debug) console.log(_role);
          return promise.then(function(){
            return Q(Role.findOrCreate({
              where: {name: _role},
            }, {
              name: _role,
            }))
            .then(function(args) {
              var role = args[0];
              var created = args[1];
              created_role[_role] |= created;
              console.log((created ? 'Created' : 'Found') + ' role:', role.name);
            });
          })
          .catch(console.log);

        }, Q.resolve())
        .then(function() {
          // add or update user
          if (debug) console.log('add or update user: ' + _user.username);
          return Q(User.upsertWithWhere({
            username: _user.username,
          }, extend({
            // default values
            email: _user.username + '@' + app.get('domain'),
            emailVerified: true,
            password: _user.username,
            ip: '127.0.0.1',
          }, _user)));
        })
        .then(function(user){
          console.log(user);

          // destroy all existing RoleMappings for user
          return Q(RoleMapping.destroyAll({
            principalType: RoleMapping.USER,
            principalId: user.id.toString(),
          }))
          .then(function(){
            // get user's roles
            return user_roles.reduce(function(promise, _role){
              return promise.then(function(){
                return Q(Role.findOne({
                  where: {
                    name: _role,
                  },
                }))
                .then(function(role) {
                  // map role to user
                  return Q(role.principals.create({
                    principalType: RoleMapping.USER,
                    principalId: user.id,
                  }))
                  .then(function(){
                    console.log('> User ' + user.email + ' added to role ' + _role);
                  });
                });
              })
              .catch(console.log);

            }, Q.resolve());
          });
        });
      })
      .catch(console.log);

    }, Q.resolve())
    .catch(console.log);
  };

  User.prototype.sendMail = function(options){
    var user = this;
    return Q.resolve().then(function(){
      if (user.email.split('@')[1] === 'anonymous') {
        throw new Error('user did not specify an email address');
      }
      return Q(User.app.models.Email.send(extend({}, options, {
        to: user.email,
      })))
      .then(function(){
        console.log('sending mail to:', user.email, user.id);
      })
      .catch(function(err){
        console.log('sending mail failed !');
        return console.log(err);
      });
    });
  };
};

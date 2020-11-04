'use strict';

var assert = require('assert');
var vows = require('vows');
var sinon = require('sinon');

process.env.NODE_ENV = process.env.NODE_ENV || 'test-node-env';
var Rollbar = require('../src/server/rollbar');

var nodeMajorVersion = process.versions.node.split('.')[0];

async function wait(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function promiseReject(rollbar, callback) {
  var error = new Error('promise reject');

  Promise.reject(error);
  await wait(500);
  callback(rollbar);
}

async function nodeThrow(rollbar, callback) {
  setTimeout(function () {
    var error = new Error('node error');
    throw error;
  }, 1);
  await wait(500);
  callback(rollbar);
}

function nestedError(nestedMessage, _password) {
  var nestedError = new Error(nestedMessage);
  throw(nestedError);
}

async function nodeThrowNested(rollbar, callback) {
  setTimeout(function () {
    var message = 'test error';
    var password = '123456';
    var err = new Error(message);

    try {
      var newMessage = 'nested ' + message;
      nestedError(newMessage, password)
    } catch (e) {
      err.nested = e;
    }

    throw err;
  }, 1);
  await wait(500);
  callback(rollbar);
}

vows.describe('locals')
  .addBatch({
    'on exception': {
      'uncaught': {
        topic: function() {
          var rollbar = new Rollbar({
            accessToken: 'abc123',
            captureUncaught: true,
            locals: true
          });
          var notifier = rollbar.client.notifier;
          rollbar.addItemStub = sinon.stub(notifier.queue, 'addItem');

          nodeThrow(rollbar, this.callback);
        },
        'should include locals': function(r) {
          var addItemStub = r.addItemStub;

          assert.isTrue(addItemStub.called);
          var data = addItemStub.getCall(0).args[3].data;
          assert.equal(data.body.trace_chain[0].exception.message, 'node error');
          if (nodeMajorVersion < 10) {
            // Node 8; locals disabled
            assert.equal(data.body.trace_chain[0].frames[0].locals, undefined);
            assert.equal(data.body.trace_chain[0].frames[1].locals, undefined);
          } else {
            assert.equal(data.body.trace_chain[0].frames[0].locals.error, '<Error object>');
            assert.equal(data.body.trace_chain[0].frames[1].locals.timer, '<Timeout object>');
          }
          addItemStub.reset();
        },
        'nested': {
          topic: function() {
            var rollbar = new Rollbar({
              accessToken: 'abc123',
              captureUncaught: true,
              locals: true
            });
            var notifier = rollbar.client.notifier;
            rollbar.addItemStub = sinon.stub(notifier.queue, 'addItem');

            nodeThrowNested(rollbar, this.callback);
          },
          'should include locals': function(r) {
            var addItemStub = r.addItemStub;

            assert.isTrue(addItemStub.called);
            var data = addItemStub.getCall(0).args[3].data;
            assert.equal(data.body.trace_chain[0].exception.message, 'test error');
            assert.equal(data.body.trace_chain[1].exception.message, 'nested test error');
            if (nodeMajorVersion < 10) {
              // Node 8; locals disabled
              assert.equal(data.body.trace_chain[0].frames[0].locals, undefined);
              assert.equal(data.body.trace_chain[0].frames[1].locals, undefined);
            } else {
              assert.equal(data.body.trace_chain[0].frames[0].locals.err, '<Error object>');
              assert.equal(data.body.trace_chain[0].frames[1].locals.timer, '<Timeout object>');

              assert.equal(data.body.trace_chain[1].frames[0].locals.nestedMessage, 'nested test error');
              assert.equal(data.body.trace_chain[1].frames[0].locals.nestedError, '<Error object>');
              assert.equal(data.body.trace_chain[1].frames[1].locals.message, 'test error');
              assert.equal(data.body.trace_chain[1].frames[1].locals.password, '********');
              assert.equal(data.body.trace_chain[1].frames[1].locals.err, '<Error object>');
              assert.equal(data.body.trace_chain[1].frames[1].locals.newMessage, 'nested test error');
            }
            addItemStub.reset();
          },
          'promise rejection': {
            topic: function() {
              var rollbar = new Rollbar({
                accessToken: 'abc123',
                captureUnhandledRejections: true,
                locals: true
              });
              var notifier = rollbar.client.notifier;
              rollbar.addItemStub = sinon.stub(notifier.queue, 'addItem');

              promiseReject(rollbar, this.callback);
            },
            'should include locals': function(r) {
              var addItemStub = r.addItemStub;

              assert.isTrue(addItemStub.called);
              var data = addItemStub.getCall(0).args[3].data;
              assert.equal(data.body.trace_chain[0].exception.message, 'promise reject');
              if (nodeMajorVersion < 10) {
                // Node 8; locals disabled
                assert.equal(data.body.trace_chain[0].frames[0].locals, undefined);
                assert.equal(data.body.trace_chain[0].frames[1].locals, undefined);
              } else {
                assert.equal(data.body.trace_chain[0].frames[0].locals.error, '<Error object>');
                assert.equal(data.body.trace_chain[0].frames[0].locals.rollbar, '<Rollbar object>');
                assert.equal(data.body.trace_chain[0].frames[1].locals.notifier, '<Notifier object>');
                assert.equal(data.body.trace_chain[0].frames[1].locals.rollbar, '<Rollbar object>');
              }
              addItemStub.reset();
            },
          }
        }
      },
    }
  }).export(module, {error: false});

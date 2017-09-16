#!/usr/bin/env node
/**
 * An executable command which will be added to $PATH.
 *
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var Yargs = require('yargs/yargs');
var assign = require('object-assign');
var packageJson = require('../package.json');
var modulename = require('..');

/** Calls <code>yargs.parse</code> and passes any thrown errors to the callback.
 * Workaround for https://github.com/yargs/yargs/issues/755
 * @private
 */
function parseYargs(yargs, args, callback) {
  // Since yargs doesn't nextTick its callback, this function must be careful
  // that exceptions thrown from callback (which propagate through yargs.parse)
  // are not caught and passed to a second invocation of callback.
  var called = false;
  try {
    yargs.parse(args, function() {
      called = true;
      return callback.apply(this, arguments);
    });
  } catch (err) {
    if (called) {
      // err was thrown after or by callback.  Let it propagate.
      throw err;
    } else {
      callback(err);
    }
  }
}

/** Options for command entry points.
 *
 * @typedef {{
 *   in: (stream.Readable|undefined),
 *   out: (stream.Writable|undefined),
 *   err: (stream.Writable|undefined)
 * }} CommandOptions
 * @property {stream.Readable=} in Stream from which input is read. (default:
 * <code>process.stdin</code>)
 * @property {stream.Writable=} out Stream to which output is written.
 * (default: <code>process.stdout</code>)
 * @property {stream.Writable=} err Stream to which errors (and non-output
 * status messages) are written. (default: <code>process.stderr</code>)
 */
// var CommandOptions;

/** Entry point for this command.
 *
 * @param {!Array<string>} args Command-line arguments.
 * @param {CommandOptions=} options Options.
 * @param {?function(Error, number=)=}
 * callback Callback for the exit code or an <code>Error</code>.  Required if
 * <code>global.Promise</code> is not defined.
 * @return {Promise<number>|undefined} If <code>callback</code> is not given
 * and <code>global.Promise</code> is defined, a <code>Promise</code> with the
 * exit code or <code>Error</code>.
 */
function modulenameCmd(args, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = null;
  }

  if (!callback && typeof Promise === 'function') {
    // eslint-disable-next-line no-undef
    return new Promise(function(resolve, reject) {
      modulenameCmd(args, options, function(err, result) {
        if (err) { reject(err); } else { resolve(result); }
      });
    });
  }

  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  try {
    if (args === undefined || args === null) {
      args = [];
    } else if (typeof args !== 'object' ||
               Math.floor(args.length) !== args.length) {
      throw new TypeError('args must be Array-like');
    } else if (args.length < 2) {
      throw new RangeError('args must have at least 2 elements');
    } else {
      args = Array.prototype.slice.call(args, 2).map(String);
    }

    if (options !== undefined && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }

    options = assign(
      {
        in: process.stdin,
        out: process.stdout,
        err: process.stderr
      },
      options
    );

    if (!options.in || typeof options.in.on !== 'function') {
      throw new TypeError('options.in must be a stream.Readable');
    }
    if (!options.out || typeof options.out.write !== 'function') {
      throw new TypeError('options.out must be a stream.Writable');
    }
    if (!options.err || typeof options.err.write !== 'function') {
      throw new TypeError('options.err must be a stream.Writable');
    }
  } catch (err) {
    process.nextTick(function() {
      callback(err);
    });
    return undefined;
  }

  // Workaround for https://github.com/yargs/yargs/issues/783
  require.main = module;
  var yargs = new Yargs(null, null, require)
    .usage('Usage: $0 [options] [args...]')
    .help()
    .alias('help', 'h')
    .alias('help', '?')
    .option('quiet', {
      alias: 'q',
      describe: 'Print less output',
      count: true
    })
    .option('verbose', {
      alias: 'v',
      describe: 'Print more output',
      count: true
    })
    .version(packageJson.name + ' ' + packageJson.version)
    .alias('version', 'V')
    .strict();
  parseYargs(yargs, args, function(err, argOpts, output) {
    if (err) {
      options.err.write(output ?
        output + '\n' :
        err.name + ': ' + err.message + '\n');
      callback(null, 1);
      return;
    }

    if (output) {
      options.out.write(output + '\n');
    }

    if (argOpts.help || argOpts.version) {
      callback(null, 0);
      return;
    }

    if (argOpts._.length !== 1) {
      options.err.write('Error: Exactly one argument is required.\n');
      callback(null, 1);
      return;
    }

    // Parse arguments then call API function with parsed options
    var cmdOpts = {
      files: argOpts._,
      verbosity: argOpts.verbose - argOpts.quiet
    };
    modulename(cmdOpts, callback);
  });

  return undefined;
}

modulenameCmd.default = modulenameCmd;
module.exports = modulenameCmd;

if (require.main === module) {
  // This file was invoked directly.
  /* eslint-disable no-process-exit */
  var mainOptions = {
    in: process.stdin,
    out: process.stdout,
    err: process.stderr
  };
  modulenameCmd(process.argv, mainOptions, function(err, exitCode) {
    if (err) {
      if (err.stdout) { process.stdout.write(err.stdout); }
      if (err.stderr) { process.stderr.write(err.stderr); }
      process.stderr.write(err.name + ': ' + err.message + '\n');

      exitCode = typeof err.exitCode === 'number' ? err.exitCode : 1;
    }

    process.exit(exitCode);
  });
}

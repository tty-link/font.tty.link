#!/usr/bin/env node
"use strict";

var FontKku = require("../font-kku.js");

function printUsage(stream) {
  stream.write("Usage: font-kku-text [text...]\n");
  stream.write("       font-kku-text -             # read from stdin\n");
  stream.write("       font-kku-text -- <text...>  # render remaining args as text (may start with '-')\n");
  stream.write("       echo \"안녕하세요\" | font-kku-text\n");
  stream.write("\n");
  stream.write("Multiple text arguments are joined with a single space.\n");
  stream.write("Options:\n");
  stream.write("  -h, --help     show this help\n");
  stream.write("  -v, --version  show the installed font-kku version\n");
  stream.write("  -           read text from stdin\n");
  stream.write("  --          stop option parsing; treat every following arg as text\n");
}

function readStdin() {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", function (chunk) {
      chunks.push(chunk);
    });
    process.stdin.on("end", function () {
      resolve(chunks.join(""));
    });
    process.stdin.on("error", reject);
  });
}

function normalizeInput(text, fromStdin) {
  var normalized = String(text == null ? "" : text).replace(/\r\n/g, "\n");
  if (fromStdin) {
    normalized = normalized.replace(/\n$/, "");
  }
  return normalized;
}

async function main() {
  var args = process.argv.slice(2);
  var textArgs = [];
  var explicitStdin = args.length === 1 && args[0] === "-";
  var afterSeparator = false;

  for (var index = 0; index < args.length; index += 1) {
    var arg = args[index];
    if (afterSeparator) {
      textArgs.push(arg);
      continue;
    }
    if (arg === "--") {
      afterSeparator = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      printUsage(process.stdout);
      return;
    }
    if (arg === "-v" || arg === "--version") {
      process.stdout.write("font-kku-text " + FontKku.version + "\n");
      return;
    }
    if (arg === "-" && explicitStdin) {
      continue;
    }
    if (arg.charAt(0) === "-") {
      process.stderr.write("font-kku-text: unknown option: " + arg + "\n");
      printUsage(process.stderr);
      process.exitCode = 2;
      return;
    }
    textArgs.push(arg);
  }

  /* `--` only terminates option parsing; it is not text by itself. Decide
   * whether to consume a pipe from the parsed text arguments so
   * `printf "안" | font-kku-text --` follows the same stdin path as the
   * no-argument form. */
  var pipedStdin = textArgs.length === 0 && !process.stdin.isTTY;
  var fromStdin = explicitStdin || pipedStdin;
  var input = "";

  if (fromStdin) {
    if (process.stdin.isTTY) {
      printUsage(process.stderr);
      process.exitCode = 1;
      return;
    }
    input = await readStdin();
  } else if (textArgs.length > 0) {
    input = textArgs.join(" ");
  }

  input = normalizeInput(input, fromStdin);
  if (!input) {
    printUsage(process.stderr);
    process.exitCode = 1;
    return;
  }

  if (!FontKku || typeof FontKku.renderText !== "function") {
    throw new Error("FontKku.renderText() is not available");
  }

  process.stdout.write(FontKku.renderText(input).join("\n") + "\n");
}

/* Unix pipes: when the reader closes early (`font-kku-text - < big.txt | head -2`)
 * the pending write fails with EPIPE. Exit quietly like other CLIs instead of
 * crashing on an unhandled 'error' event with a stack trace. */
process.stdout.on("error", function (error) {
  if (error && error.code === "EPIPE") {
    process.exit(0);
  }
  throw error;
});

main().catch(function (error) {
  process.stderr.write("font-kku-text: " + error.message + "\n");
  process.exitCode = 1;
});

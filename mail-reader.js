
var MailParser = require('mailparser').MailParser;
var fs = require('fs')
var uuid = require('uuid');

var pluginName = 'mail-reader'

module.exports = function(options) {

  var seneca = this;

  seneca.add({role: pluginName, cmd: 'validateSender'}, function(args, done) {
    // call done() with an error to invalidate the sender
    done();
  });

  seneca.add({role: pluginName, cmd: 'validateRecipient'}, function(args, done) {
    // call done() with an error to invalidate the recipient
    done();
  });

  seneca.add({role: pluginName, cmd: 'attachment'}, function(args, done) {
    var output = fs.createWriteStream(args.attachment.generatedFileName);
    args.attachment.stream.pipe(output);
    done();
  });

  seneca.add({role: pluginName, cmd: 'mail'}, function(args, done) {
    console.log('received email', JSON.stringify(args.mail))
    done();
  });

  function redirectAttachmentStreamToSeneca(attachment) {
    seneca.act({role: pluginName, cmd: 'attachment', attachment: attachment});
  }

  seneca.add({role: pluginName, cmd: 'connection'}, function(args, done) {
    done();
  });

  seneca.add({role: pluginName, cmd: 'writeChunk'}, function(args, done) {
    if(!args.connection.id) {
      args.connection.id = uuid.v4();
      args.connection.parser = new MailParser({ streamAttachments: true });
      args.connection.parser.on("attachment", redirectAttachmentStreamToSeneca);
      args.connection.parser.on("end", function(mail){
        seneca.act({role: pluginName, cmd: 'mail', mail: mail, connection: args.connection})
      });
    }
    args.connection.parser.write(args.chunk);
    done();
  });

  seneca.add({role: pluginName, cmd: 'writeEnd'}, function(args, done) {
    args.connection.parser.end();
    args.connection.parser.removeListener('attachment', redirectAttachmentStreamToSeneca);
    done();
  });

  return {
    name: pluginName
  }

};

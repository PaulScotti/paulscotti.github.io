#!/usr/bin/perlml
use CGI qw(:standard);
use CGI::Carp qw(warningsToBrowser fatalsToBrowser);  # Make sure we can see any errors

# Structure on the server:
#  This file:
#    paulscotti.github.io/mturk/save.pl
#  Data gets saved in:
#    paulscotti.github.io/mturk/data/{experimentName}/
#  Each subject gets saved using their id:
#		 paulscotti.github.io/mturk/data/{experimentName}/{id}.txt
#
# Note that this means that anybody can load this file directly and
# create files on your server. E.g., if somebody goes to the URL
# timbrady.org/turk/save.pl?id=hello&experimentName=tim&curData=you+da+bomb,
# that will create a file on my server in the directory tim. So it isn't the
# safest thing in the world. But I don't have any problems, and they can
# only create text files.
#
# How to make this file work:
#  You'll probably need to change the top line to be the address of perl
#  on your server (it might be /usr/bin/perl or /usr/local/bin/perl).
#  You'll also need to chmod this file to 755.
#

print header;
my $cgi = CGI->new;

# Parse out the three fields we know the experiments always send us,
# the id, the experimentName, and the data (curData). Save the data
# in a file called {id}.txt in folder {experimentName}.
my $id = $cgi->param('id');
my $experimentName = $cgi->param('experimentName');
my $curData = $cgi->param('curData');

mkdir "data/${experimentName}", 0777 unless -d "data/${experimentName}";
open(FID, '>', "data/${experimentName}/${id}.txt");
print FID "$curData";
print "done";
close(FID);

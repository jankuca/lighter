
# The $1 argument is the project root path (defaults to ".")
# Note: The provided Sublime Text build command automatically passes
#   the $project_path variable to this script.
PROJECT_DIR_RELATIVE=$1
[ -z $1 ] && PROJECT_DIR_RELATIVE="."

PROJECT_DIR=`cd $PROJECT_DIR_RELATIVE ; pwd`



/usr/local/bin/gjslint                                                        \
  $PROJECT_DIR/src/*.js                                                       \
  $PROJECT_DIR/src/widgets/*.js                                               \
                                                                              \
| grep -v 'E:0001:'                                                           \
| grep -v 'E:0100:'                                                           \
| grep -v 'Found'                                                             \
| grep -v 'fixjsstyle'                                                        \
| grep -v 'auto-fixable'                                                      \
| grep -v 'run by executing'                                                  \

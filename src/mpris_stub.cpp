#include "mpris.h"

namespace yugen::mpris
{
     void start(Handler) {}
     void stop() {}

     void update_track(const std::string&, const std::string&, const std::string&,
          const std::string&, const std::string&) {}

     void update_state(bool, double, double, double, bool, bool, bool, bool) {}
     void seeked(double) {}
}

case class LogEntry(level: String, message: String)
case class Report(skipped: Int, counts: Map[String, Int], longestErrorRun: Int, topErrors: List[(String, Int)])

private val Levels = Set("INFO", "WARN", "ERROR")

def parseLine(line: String): Option[LogEntry] =
  line.trim.split("\\s+", 3) match
    case Array(_, level, message) if Levels(level) => Some(LogEntry(level, message))
    case _                                         => None

def countByLevel(entries: List[LogEntry]): Map[String, Int] =
  entries.groupMapReduce(_.level)(_ => 1)(_ + _)

def longestErrorRun(entries: List[LogEntry]): Int =
  entries
    .foldLeft((0, 0)) { case ((best, current), e) =>
      val next = if e.level == "ERROR" then current + 1 else 0
      (best max next, next)
    }
    ._1

def topErrors(entries: List[LogEntry], n: Int): List[(String, Int)] =
  entries
    .filter(_.level == "ERROR")
    .groupMapReduce(_.message)(_ => 1)(_ + _)
    .toList
    .sortBy((message, count) => (-count, message))
    .take(n)

def analyse(lines: List[String], n: Int): Report =
  val entries = lines.flatMap(parseLine)
  Report(lines.size - entries.size, countByLevel(entries), longestErrorRun(entries), topErrors(entries, n))

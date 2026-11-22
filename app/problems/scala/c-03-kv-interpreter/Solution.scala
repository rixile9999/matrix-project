enum Command:
  case Put(key: String, value: Int)
  case Get(key: String)
  case Del(key: String)
  case Incr(key: String)

type Store = Map[String, Int]

def parseCommand(line: String): Either[String, Command] =
  line.trim.split("\\s+").toList match
    case Nil | "" :: Nil => Left("빈 줄")
    case word :: args =>
      (word.toUpperCase, args) match
        case ("SET", List(k, v)) => v.toIntOption.map(Command.Put(k, _)).toRight(s"SET: 숫자가 아님: $v")
        case ("GET", List(k))    => Right(Command.Get(k))
        case ("DEL", List(k))    => Right(Command.Del(k))
        case ("INCR", List(k))   => Right(Command.Incr(k))
        case (name @ ("SET" | "GET" | "DEL" | "INCR"), _) => Left(s"$name: 인자 개수 오류")
        case _ => Left(s"알 수 없는 명령: $word")

def step(store: Store, cmd: Command): (Store, String) = cmd match
  case Command.Put(k, v) => (store.updated(k, v), "OK")
  case Command.Get(k)    => (store, store.get(k).fold("(nil)")(_.toString))
  case Command.Del(k)    => (store - k, if store.contains(k) then "1" else "0")
  case Command.Incr(k) =>
    val next = store.getOrElse(k, 0) + 1
    (store.updated(k, next), next.toString)

def runAll(lines: List[String]): (Store, List[String]) =
  val (store, outputs) = lines.foldLeft((Map.empty[String, Int], List.empty[String])) {
    case ((st, out), line) =>
      parseCommand(line) match
        case Left(msg) => (st, s"ERR $msg" :: out)
        case Right(cmd) =>
          val (st2, o) = step(st, cmd)
          (st2, o :: out)
  }
  (store, outputs.reverse)

def transcript(lines: List[String]): List[String] =
  val (store, outputs) = runAll(lines)
  val numbered = outputs.zipWithIndex.map((o, i) => s"${i + 1}: $o")
  val finalState = store.toList.sorted.map((k, v) => s"$k=$v")
  numbered ++ ("--" :: finalState)

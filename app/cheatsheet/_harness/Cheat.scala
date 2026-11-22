object Cheat:
  def show(id: String, line: Int, v: Any): Unit = println(s"##SHOW|$id|$line|$v".replace("\n", "\\n"))
  def touch(x: Any): Unit = ()

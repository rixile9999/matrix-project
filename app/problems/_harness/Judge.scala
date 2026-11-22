// Shared test helper. Each check prints one protocol line: ##CASE|ok|fail|error|<name>|<detail>
object Judge:
  def check[A](name: String)(actual: => A, expected: A): Unit =
    val line =
      try
        val a = actual
        if a == expected then s"ok|$name|" else s"fail|$name|기대 $expected, 실제 $a"
      catch case e: Throwable => s"error|$name|${e.getClass.getSimpleName}: ${e.getMessage}"
    println("##CASE|" + line.replace("\n", " "))

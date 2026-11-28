// p001.2.1 채점: scala-cli run project.scala <answer>.scala p001.2.1.tests.scala
case class Box(v: Int)

@main def p00121Tests(): Unit =
  val cases: List[(String, () => Boolean)] = List(
    "open(Box(7)) == 7"   -> (() => open(Box(7)) == 7),
    "open(Box(0)) == 0"   -> (() => open(Box(0)) == 0),
    "open(Box(-4)) == -4" -> (() => open(Box(-4)) == -4)
  )
  var failed = 0
  for (name, check) <- cases do
    val ok = try check() catch case e: Throwable => false
    if !ok then failed += 1
    println(s"${if ok then "PASS" else "FAIL"}  $name")
  println(s"${cases.size - failed}/${cases.size}")

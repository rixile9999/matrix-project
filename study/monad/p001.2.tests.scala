// p001.2 채점: scala-cli run project.scala <answer>.scala p001.2.tests.scala
@main def p0012Tests(): Unit =
  val cases: List[(String, () => Boolean)] = List(
    "unwrap(Some(5)) == 5"   -> (() => unwrap(Some(5)) == 5),
    "unwrap(None) == 0"      -> (() => unwrap(None) == 0),
    "unwrap(Some(-3)) == -3" -> (() => unwrap(Some(-3)) == -3),
    "unwrap(Some(0)) == 0"   -> (() => unwrap(Some(0)) == 0)
  )
  var failed = 0
  for (name, check) <- cases do
    val ok = try check() catch case e: Throwable => false
    if !ok then failed += 1
    println(s"${if ok then "PASS" else "FAIL"}  $name")
  println(s"${cases.size - failed}/${cases.size}")

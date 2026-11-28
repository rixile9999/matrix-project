// p001.1 채점: scala-cli run project.scala <answer>.scala p001.1.tests.scala
@main def p0011Tests(): Unit =
  val cases: List[(String, () => Boolean)] = List(
    "adder(3)(4) == 7"        -> (() => adder(3)(4) == 7),
    "adder(0)(5) == 5"        -> (() => adder(0)(5) == 5),
    "adder(-2)(2) == 0"       -> (() => adder(-2)(2) == 0),
    "returns a function"      -> (() => { val f: Int => Int = adder(1); f(1) == 2 }),
    "independent adders"      -> (() => { val a = adder(1); val b = adder(10); a(1) == 2 && b(1) == 11 })
  )
  var failed = 0
  for (name, check) <- cases do
    val ok = try check() catch case e: Throwable => false
    if !ok then failed += 1
    println(s"${if ok then "PASS" else "FAIL"}  $name")
  println(s"${cases.size - failed}/${cases.size}")

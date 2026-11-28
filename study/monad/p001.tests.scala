// p001 채점: 제출한 compose를 이 파일과 함께 실행한다.
// scala-cli run project.scala <answer>.scala p001.tests.scala

@main def p001Tests(): Unit =
  val parse: String => Option[Int] = _.toIntOption
  val recip: Int => Option[Double] = n => if n == 0 then None else Some(1.0 / n)
  val half: Int => Option[Int] = n => if n % 2 == 0 then Some(n / 2) else None

  var calls = 0
  val counted: Int => Option[Double] = n => { calls += 1; recip(n) }

  val cases: List[(String, () => Boolean)] = List(
    "both succeed: \"4\" -> Some(0.25)" -> (() => compose(parse, recip)("4") == Some(0.25)),
    "second fails: \"0\" -> None"       -> (() => compose(parse, recip)("0") == None),
    "first fails: \"x\" -> None"        -> (() => compose(parse, recip)("x") == None),
    "same types: half∘half 8 -> Some(2)" -> (() => compose(half, half)(8) == Some(2)),
    "same types: half∘half 6 -> None"    -> (() => compose(half, half)(6) == None),
    "g not called when f fails"          -> (() => { calls = 0; compose(parse, counted)("x"); calls == 0 }),
    "g called once when f succeeds"      -> (() => { calls = 0; compose(parse, counted)("2"); calls == 1 })
  )
  var failed = 0
  for (name, check) <- cases do
    val ok = try check() catch case e: Throwable => false
    if !ok then failed += 1
    println(s"${if ok then "PASS" else "FAIL"}  $name")
  println(s"${cases.size - failed}/${cases.size}")

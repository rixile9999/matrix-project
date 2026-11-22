@main def tests(): Unit =
  given Monoid[Boolean] = new Monoid[Boolean]:
    def empty: Boolean = true
    def combine(x: Boolean, y: Boolean): Boolean = x && y
  given Monoid[List[Int]] = new Monoid[List[Int]]:
    def empty: List[Int] = Nil
    def combine(x: List[Int], y: List[Int]): List[Int] = x ++ y
  Judge.check("Int 합")(combineAll(List(1, 2, 3, 4)), 10)
  Judge.check("Int 빈 리스트")(combineAll(List.empty[Int]), 0)
  Judge.check("음수 포함")(combineAll(List(5, -8)), -3)
  Judge.check("문자열 이어 붙이기는 순서 유지")(combineAll(List("a", "b", "c")), "abc")
  Judge.check("문자열 빈 리스트")(combineAll(List.empty[String]), "")
  Judge.check("이름으로 직접 호출")(intAddition.combine(2, 3), 5)
  Judge.check("다른 타입(Boolean)")(combineAll(List(true, true, false)), false)
  Judge.check("다른 타입(리스트) 순서 유지")(combineAll(List(List(1), List(2, 3), Nil, List(4))), List(1, 2, 3, 4))

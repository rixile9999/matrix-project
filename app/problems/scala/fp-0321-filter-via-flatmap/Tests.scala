@main def tests(): Unit =
  Judge.check("짝수만")(filterViaFlatMap(List(1, 2, 3, 4, 5, 6))(_ % 2 == 0), List(2, 4, 6))
  Judge.check("모두 통과")(filterViaFlatMap(List(1, 2, 3))(_ => true), List(1, 2, 3))
  Judge.check("모두 탈락")(filterViaFlatMap(List(1, 2, 3))(_ => false), Nil)
  Judge.check("빈 리스트")(filterViaFlatMap(List.apply[Int]())(_ > 0), Nil)
  Judge.check("문자열, 순서와 중복 유지")(filterViaFlatMap(List("a", "bb", "a", "c"))(_ == "a"), List("a", "a"))
  Judge.check("술어는 원소당 한 번만 호출")({
    val calls = scala.collection.mutable.ArrayBuffer.empty[Int]
    filterViaFlatMap(List(1, 2, 3))(x => { calls += x; true })
    calls.toList
  }, scala.List(1, 2, 3))

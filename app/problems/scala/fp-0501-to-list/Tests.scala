@main def tests(): Unit =
  Judge.check("여러 원소")(Stream(1, 2, 3).toList, List(1, 2, 3))
  Judge.check("빈 스트림")(Stream.empty[Int].toList, List.empty[Int])
  Judge.check("원소 하나")(Stream("a").toList, List("a"))
  Judge.check("cons로 만든 스트림")(Stream.cons(1, Stream.cons(2, Stream.empty)).toList, List(1, 2))
  Judge.check("순서 유지")(Stream(3, 1, 2).toList, List(3, 1, 2))
  var forced = 0
  val counted = Stream.cons({ forced += 1; 1 }, Stream.cons({ forced += 1; 2 }, Stream.empty))
  Judge.check("만들기만 해서는 평가되지 않음")(forced, 0)
  Judge.check("toList를 두 번 불러도 원소는 한 번씩만 평가")({ counted.toList; counted.toList; forced }, 2)

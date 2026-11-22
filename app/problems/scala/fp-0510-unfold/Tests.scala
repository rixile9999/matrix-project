@main def tests(): Unit =
  Judge.check("무한: 2배씩 늘어나는 수")(unfold(1)(n => Some((n, n * 2))).take(5).toList, List(1, 2, 4, 8, 16))
  Judge.check("None으로 끝남")(unfold(0)(n => if n < 3 then Some((n, n + 1)) else None).toList, List(0, 1, 2))
  Judge.check("처음부터 None이면 빈 스트림")(unfold(0)(_ => None: Option[(Int, Int)]).toList, List.empty[Int])
  Judge.check("상태와 값의 타입이 다름")(unfold(1)(n => if n <= 3 then Some(("#" * n, n + 1)) else None).toList, List("#", "##", "###"))
  Judge.check("튜플 상태: 피보나치")(unfold((0, 1)) { case (a, b) => Some((a, (b, a + b))) }.take(8).toList, List(0, 1, 1, 2, 3, 5, 8, 13))
  var calls = 0
  val s = unfold(0) { n => calls += 1; Some((n, n + 1)) }
  Judge.check("만들 때는 많아야 한 번만 호출")(calls <= 1, true)
  Judge.check("두 개를 꺼낼 때까지 많아야 두 번 호출")({ s.take(2).toList; calls <= 2 }, true)

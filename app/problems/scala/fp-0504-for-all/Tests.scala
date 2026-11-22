def nat(n: Int): Stream[Int] = Stream.cons(n, nat(n + 1))

@main def tests(): Unit =
  Judge.check("모두 만족")(Stream(2, 4, 6).forAll(_ % 2 == 0), true)
  Judge.check("하나라도 불만족")(Stream(2, 3, 6).forAll(_ % 2 == 0), false)
  Judge.check("빈 스트림은 참")(Stream.empty[Int].forAll(_ > 100), true)
  Judge.check("무한 스트림에서 반례가 있으면 끝남")(nat(1).forAll(_ < 100), false)
  Judge.check("반례 뒤의 꼬리는 평가하지 않음")(Stream.cons(1, Stream.cons(2, sys.error("끝까지 읽었다"))).forAll(_ > 1), false)
  var calls = 0
  Judge.check("술어는 반례를 만날 때까지만 호출")({ Stream(1, 2, 3, 4, 5).forAll { x => calls += 1; x < 3 }; calls }, 3)

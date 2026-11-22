def nat(n: Int): Stream[Int] = Stream.cons(n, nat(n + 1))

def headOf[A](s: Stream[A]): A = s match
  case Stream.Cons(h, _) => h()
  case Stream.Empty => sys.error("빈 스트림")

@main def tests(): Unit =
  Judge.check("take: 앞의 n개")(Stream(1, 2, 3, 4).take(2).toList, List(1, 2))
  Judge.check("take: 0개와 길이 초과")((Stream(1, 2, 3).take(0).toList, Stream(1, 2, 3).take(10).toList), (List.empty[Int], List(1, 2, 3)))
  Judge.check("take: 무한 스트림에서도 끝남")(nat(1).take(4).toList, List(1, 2, 3, 4))
  Judge.check("take: n번째 뒤의 꼬리는 평가하지 않음")(Stream.cons(1, Stream.cons(2, sys.error("꼬리를 평가했다"))).take(2).toList, List(1, 2))
  Judge.check("drop: 앞의 n개 건너뛰기")(Stream(1, 2, 3, 4).drop(2).toList, List(3, 4))
  Judge.check("drop: 0개와 길이 초과")((Stream(1, 2, 3).drop(0).toList, Stream(1, 2, 3).drop(5).toList), (List(1, 2, 3), List.empty[Int]))
  Judge.check("drop: 건너뛰는 원소의 머리는 평가하지 않음")(Stream.cons(sys.error("머리를 평가했다"): Int, Stream.cons(2, Stream.empty)).drop(1).toList, List(2))
  Judge.check("drop: 무한 스트림")(headOf(nat(1).drop(1000)), 1001)

@main def tests(): Unit =
  Judge.check("곱 구현 › 일반")(productRight(List(1.0, 2.0, 3.0, 4.0)), 24.0)
  Judge.check("곱 구현 › 빈 리스트")(productRight(Nil), 1.0)
  Judge.check("곱 구현 › 0이 있으면 0")(productRight(List(2.0, 0.0, 5.0)), 0.0)
  Judge.check("곱 구현 › 소수")(productRight(List(0.5, 4.0)), 2.0)
  Judge.check("곱 구현 › 한 원소")(productRight(List(7.0)), 7.0)
  Judge.check("단락 평가 › f 호출 횟수")(fCalls, 4)

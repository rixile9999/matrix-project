@main def tests(): Unit =
  Judge.check("step 1")({ val c = makeCounter(1); List(c(), c(), c()) }, List(1, 2, 3))
  Judge.check("step 5")({ val c = makeCounter(5); List(c(), c()) }, List(5, 10))
  Judge.check("카운터끼리 독립")({ val a = makeCounter(1); val b = makeCounter(1); a(); a(); b() }, 1)
  Judge.check("step 0")({ val c = makeCounter(0); (c(), c()) }, (0, 0))
  Judge.check("함수 값으로 전달")(List.fill(3)(makeCounter(2)).map(f => f()), List(2, 2, 2))
